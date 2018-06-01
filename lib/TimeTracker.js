const fs = require('fs');
const path = require('path');
const request = require('request').defaults({ jar: true, strictSSL: false});
const Util = require('./Util');

module.exports = class TimeTracker {
  /**
   * Get the RC
   */
  constructor () {
    this.rcPath = path.resolve(
      process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'],
      '.timetrackerrc'
    );
    this.rc = fs.existsSync(this.rcPath) ? JSON.parse(fs.readFileSync(this.rcPath)) : {};
  }

  /**
   * Flush entries to TimeTracker
   */
  flush(entries) {
    entries = entries.slice(0)
    this.askUrl()
      .then(this.login.bind(this))
      .then(this.askEntity.bind(this, 'customer'))
      .then(this.askEntity.bind(this, 'project'))
      .then(this.askEntity.bind(this, 'activity'))
      .then(() => {
        const rc = this.rc;
        const saveNext = () => {
          const entry = entries.shift();
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
            try {
              if (error) {
                throw error;
              } else if (response.statusCode !== 200) {
                throw new Error(body);
              }
              const result = JSON.parse(body);
              if (!result.result.id) {
                throw new Error(result.alert);
              }
            } catch (e) {
              console.log(
                Util.formatDate(entry),
                Util.formatTime(entry.from),
                Util.formatTime(entry.to),
                (e.message + '').red
              );
            }
            saveNext();
          });
        };
        saveNext();
      });
  }

  info () {
    this.askUrl()
      .then(this.login.bind(this))
      .then(() => {
        const askMonth = () => {
          const month = new Date().getMonth() || 12
          return Util.ask(`Month <${month}>: `).then(m => {
            m = parseInt(m) || month
            if (m >= 1 && m <= 12) {
              return m
            } else {
              return askMonth()
            }
          })
        }
        const baseUrl = this.rc.url
        askMonth().then(month => Util.ask('Hours/day <8>: ').then(h => parseInt(h) || 8).then(hoursPerDay => {
          Util.initHolidays('de', 'sn') // TODO: Ask this as well
            .then(() => request.get(baseUrl + '/getUsers', (error, response, body) => {
              if (error) {
                throw error
              }
              const users = JSON.parse(body)
              const user = users.map(u => u.user).find(u => u.username === this.rc.user)
              if (!user) {
                throw 'Could not find user'
              }
              const year = new Date().getFullYear() - (month > new Date().getMonth() + 1 ? 1 : 0);
              request.get(`${baseUrl}/interpretation/entries?month=${month}&year=${year}&user=${user.id}`, (error, response, body) => {
                if (error) {
                  throw error
                }
                const minutesByDay = {}
                let workedSum = 0
                let diffSum = 0
                JSON.parse(body).map(e => e.entry).forEach(entry => {
                  if (!minutesByDay.hasOwnProperty(entry.date)) {
                    minutesByDay[entry.date] = 0
                  }
                  const hours = parseInt(entry.duration.split(':', 1)[0])
                  const minutes = parseInt(entry.duration.split(':', 2)[1]) + hours * 60
                  minutesByDay[entry.date] += minutes
                  workedSum += minutes
                })
                const date = new Date(Date.UTC(year, month - 1, 1))
                console.log('Date       | Worked |   Diff')
                console.log('-----------|--------|--------')
                while (date.getMonth() === month - 1 && date.getFullYear() === year) {
                  const d = Util.pad(date.getDate(), 2) + '/' + Util.pad(month, 2) + '/' + year
                  let time = '  -  '
                  let diff = '   -  '
                  if (date.getDay() !== 0 && date.getDay() !== 6 && !Util.isHoliday(date)) {
                    time = Util.formatTime(minutesByDay[d] || 0)
                    diff = (minutesByDay[d] || 0) - hoursPerDay * 60
                    diffSum += diff
                    diff = Util.pad((diff > 0 ? '+' : (diff < 0 ? '-' : '')) + Util.formatTime(Math.abs(diff)), 6)
                  }
                  console.log(d + ' |  ' + time + ' |  ' + diff)
                  date.setDate(date.getDate() + 1)
                }
                console.log('-----------|--------|--------')
                console.log('SUM        | '
                  + Util.pad(Util.formatTime(workedSum), 6, ' ') + ' | '
                  + Util.pad((diffSum > 0 ? '+' : (diffSum < 0 ? '-' : '')) + Util.formatTime(Math.abs(diffSum)), 7, ' ')
                )
              })
            }))
        }))
      })
  }

  /**
   * Ask for the URL until it's valid
   *
   * @return {Promise.<String>}
   */
  askUrl() {
    const rc = this.rc;
    return Util.ask('TimeTracker URL' + (rc.url ? ' <' + rc.url + '>' : '') + ': ').then((url) => {
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
      Util.ask('User name' + (this.rc.user ? ' <' + this.rc.user + '>' : '') + ': ').then((user) => {
        const username = user || this.rc.user;
        if (!username) {
          return this.login().then(resolve);
        } else {
          this.rc.user = username;
          this.flushRc();
        }
        Util.ask('Password: ', true).then((password) => {
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
            Util.ask('Proceed with ' + type + ' ' + entry.name + ' <yes>: ').then((answer) => {
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
            Util.ask('Use ' + type + ' (0...' + (entries.length - 1) + '): ').then((index) => {
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
}