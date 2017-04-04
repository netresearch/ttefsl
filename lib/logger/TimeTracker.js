const AbstractLogger = require('./Abstract');
const fs = require('fs');
const path = require('path');
const request = require('request').defaults({ jar: true, strictSSL: false});
const Util = require('../Util');

/**
 * Log to timetracker
 *
 * @type {PreviewLogger}
 */
module.exports = class PreviewLogger extends AbstractLogger {
  /**
   * Get the RC
   */
  init() {
    this.rcPath = path.resolve(
      process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'],
      '.timetrackerrc'
    );
    this.rc = fs.existsSync(this.rcPath) ? JSON.parse(fs.readFileSync(this.rcPath)) : {};
  }

  /**
   * Flush entries to TimeTracker
   */
  flush() {
    this.askUrl()
      .then(this.login.bind(this))
      .then(this.askEntity.bind(this, 'customer'))
      .then(this.askEntity.bind(this, 'project'))
      .then(this.askEntity.bind(this, 'activity'))
      .then(() => {
        const rc = this.rc;
        const saveNext = () => {
          const entry = this.entries.shift();
          if (!entry) {
            return;
          }
          const date = Util.formatDate(entry) + 'T';
          const formData = {
            date: date + Util.formatTime({ hour: 0, minute: 0 }, true),
            start: date + Util.formatTime(entry.from, true),
            end: date + Util.formatTime(entry.to, true),
            customer: rc.customer,
            project: rc.project,
            activity: rc.activity
          };
          request.post({ url: rc.url + '/tracking/save', formData }, (error, response, body) => {
            if (error) {
              throw error;
            } else if (response.statusCode !== 200) {
              console.log(body.red);
              throw 'Error while writing';
            }
            const result = JSON.parse(body);
            if (!result.result.id) {
              console.log(result.alert);
              throw 'Error while writing';
            }
            saveNext();
          });
        };
        saveNext();
    });
  }

  /**
   * Ask for the URL until it's valid
   *
   * @return {Promise.<String>}
   */
  askUrl() {
    const rc = this.rc;
    return this.ask('TimeTracker URL' + (rc.url ? ' <' + rc.url + '>' : '') + ': ').then((url) => {
      url = (url || rc.url).replace(/\/+$/, '');
      if (!url) {
        return this.askUrl();
      }
      return new Promise((resolve) => {
        request({url}, (error, response, body) => {
          if (error) {
            console.error((error.code === 'ENOTFOUND' ? 'URL could not be found' : error.message).red);
            this.askUrl().then(resolve);
            return;
          }
          if (body.indexOf('/bundles/netresearchtimetracker/') < 0) {
            console.error('This doesn\'t seem to be a valid timetracker installation'.red);
            this.askUrl().then(resolve);
            return;
          }
          rc.url = url;
          this.flushRc();
          resolve(url);
        });
      });
    });
  }

  /**
   * Try to login until login is successful (Further requests will be authorized
   * by session id in request cookie jar)
   *
   * @return {Promise}
   */
  login() {
    return new Promise((resolve) => {
      this.ask('User name' + (this.rc.user ? ' <' + this.rc.user + '>' : '') + ': ').then((user) => {
        const username = user || this.rc.user;
        if (!username) {
          return this.login().then(resolve);
        } else {
          this.rc.user = username;
          this.flushRc();
        }
        this.ask('Password: ', true).then((password) => {
          request.post(
            {url: this.rc.url + '/login', jar: true, formData: {username, password, loginCookie: 'on'}},
            (error, response, body) => {
              if (response.statusCode !== 302) {
                console.error('Invalid login'.red);
                return this.login().then(resolve);
              }
              resolve();
            }
          )
        });
      });
    })
  }

  /**
   * Ask for customer, project or activity
   *
   * @param {String} type
   * @return {Promise}
   */
  askEntity(type) {
    const rc = this.rc;
    const paths = {
      customer: 'getAllCustomers',
      project: 'getAllProjects?customer=' + rc.customer,
      activity: 'getActivities'
    };
    return new Promise((resolve) => {
      request(rc.url + '/' + paths[type], (error, response, body) => {
        if (error) {
          throw error;
        }
        if (response.statusCode !== 200) {
          console.log((body + '').red);
          throw 'Invalid response';
        }

        const entries = JSON.parse(body)
          .map(item => item[type])
          .filter(c => c.name && (!c.hasOwnProperty('active') || c.active));

        let entriesShown = false;
        const askId = (id) => {
          const entry = id ? entries.find(e => parseInt(e.id) === id) : undefined;
          if (entry) {
            this.ask('Proceed with ' + type + ' ' + entry.name + ' <yes>: ').then((answer) => {
              if (!answer || answer[0].toLowerCase() === 'y') {
                rc[type] = parseInt(entry.id);
                resolve(entry);
              } else {
                delete rc[type];
                askId();
              }
              this.flushRc();
            });
          } else {
            if (!entriesShown) {
              entries.forEach((e, i) => {
                console.log(i + ') ', e.name);
              });
              entriesShown = true;
            }
            this.ask('Use ' + type + ' (0...' + (entries.length - 1) + '): ').then((index) => {
              const i = parseInt(index);
              if (isNaN(i) || !entries[i]) {
                console.error('Number not valid'.red);
              }
              askId(parseInt(entries[i].id));
            });
          }
        };
        askId(rc[type]);
      });
    })
  }

  /**
   * Save the RC
   */
  flushRc() {
    fs.writeFileSync(this.rcPath, JSON.stringify(this.rc));
  }
};