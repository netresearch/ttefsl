const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const Util = require('./Util');

// Create axios instance with cookie support and SSL bypass
const cookieJar = {};
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const httpClient = axios.create({
  httpsAgent,
  maxRedirects: 0,
  validateStatus: (status) => status >= 200 && status < 400
});

// Cookie handling interceptors
httpClient.interceptors.request.use((config) => {
  const url = new URL(config.url, config.baseURL);
  const host = url.host;
  if (cookieJar[host]) {
    config.headers.Cookie = cookieJar[host].join('; ');
  }
  return config;
});

httpClient.interceptors.response.use((response) => {
  const url = new URL(response.config.url, response.config.baseURL);
  const host = url.host;
  const setCookie = response.headers['set-cookie'];
  if (setCookie) {
    if (!cookieJar[host]) {
      cookieJar[host] = [];
    }
    setCookie.forEach((cookie) => {
      const cookieName = cookie.split('=')[0];
      // Replace existing cookie or add new one
      const existingIndex = cookieJar[host].findIndex(c => c.startsWith(cookieName + '='));
      const cookieValue = cookie.split(';')[0];
      if (existingIndex >= 0) {
        cookieJar[host][existingIndex] = cookieValue;
      } else {
        cookieJar[host].push(cookieValue);
      }
    });
  }
  return response;
}, (error) => {
  // Handle redirect responses (302 for login)
  if (error.response && error.response.status === 302) {
    const url = new URL(error.config.url, error.config.baseURL);
    const host = url.host;
    const setCookie = error.response.headers['set-cookie'];
    if (setCookie) {
      if (!cookieJar[host]) {
        cookieJar[host] = [];
      }
      setCookie.forEach((cookie) => {
        const cookieName = cookie.split('=')[0];
        const existingIndex = cookieJar[host].findIndex(c => c.startsWith(cookieName + '='));
        const cookieValue = cookie.split(';')[0];
        if (existingIndex >= 0) {
          cookieJar[host][existingIndex] = cookieValue;
        } else {
          cookieJar[host].push(cookieValue);
        }
      });
    }
    return error.response;
  }
  return Promise.reject(error);
});

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
          const formData = new URLSearchParams({
            date: date + Util.formatTime({ hour: 0, minute: 0 }, true),
            start: date + Util.formatTime(entry.from, true),
            end: date + Util.formatTime(entry.to, true),
            customer: rc.customer,
            project: rc.project,
            activity: rc.activity
          });
          httpClient.post(rc.url + '/tracking/save', formData)
            .then((response) => {
              const result = response.data;
              if (!result.result || !result.result.id) {
                throw new Error(result.alert || 'Unknown error');
              }
            })
            .catch((e) => {
              console.log(
                Util.formatDate(entry),
                Util.formatTime(entry.from),
                Util.formatTime(entry.to),
                ((e.message || e) + '').red
              );
            })
            .finally(() => {
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
          Util.initHolidays('de', 'sn')
            .then(() => httpClient.get(baseUrl + '/getUsers'))
            .then((response) => {
              const users = response.data;
              const user = users.map(u => u.user).find(u => u.username === this.rc.user);
              if (!user) {
                throw new Error('Could not find user');
              }
              const year = new Date().getFullYear() - (month > new Date().getMonth() + 1 ? 1 : 0);
              return httpClient.get(`${baseUrl}/interpretation/entries?month=${month}&year=${year}&user=${user.id}`);
            })
            .then((response) => {
              const minutesByDay = {};
              let workedSum = 0;
              let diffSum = 0;
              response.data.map(e => e.entry).forEach(entry => {
                if (!minutesByDay.hasOwnProperty(entry.date)) {
                  minutesByDay[entry.date] = 0;
                }
                const hours = parseInt(entry.duration.split(':', 1)[0]);
                const minutes = parseInt(entry.duration.split(':', 2)[1]) + hours * 60;
                minutesByDay[entry.date] += minutes;
                workedSum += minutes;
              });
              const month_ = month;
              const year = new Date().getFullYear() - (month > new Date().getMonth() + 1 ? 1 : 0);
              const date = new Date(Date.UTC(year, month_ - 1, 1));
              console.log('Date       | Worked |   Diff');
              console.log('-----------|--------|--------');
              while (date.getMonth() === month_ - 1 && date.getFullYear() === year) {
                const d = Util.pad(date.getDate(), 2) + '/' + Util.pad(month_, 2) + '/' + year;
                let time = '  -  ';
                let diff = '   -  ';
                if (date.getDay() !== 0 && date.getDay() !== 6 && !Util.isHoliday(date)) {
                  time = Util.formatTime(minutesByDay[d] || 0);
                  diff = (minutesByDay[d] || 0) - hoursPerDay * 60;
                  diffSum += diff;
                  diff = Util.pad((diff > 0 ? '+' : (diff < 0 ? '-' : '')) + Util.formatTime(Math.abs(diff)), 6);
                }
                console.log(d + ' |  ' + time + ' |  ' + diff);
                date.setDate(date.getDate() + 1);
              }
              console.log('-----------|--------|--------');
              console.log('SUM        | '
                + Util.pad(Util.formatTime(workedSum), 6, ' ') + ' | '
                + Util.pad((diffSum > 0 ? '+' : (diffSum < 0 ? '-' : '')) + Util.formatTime(Math.abs(diffSum)), 7, ' ')
              );
            })
            .catch((error) => {
              console.error((error.message || error).red);
            });
        }));
      });
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
      return httpClient.get(url)
        .then((response) => {
          const body = response.data;
          if (typeof body === 'string' && body.indexOf('/bundles/netresearchtimetracker/') < 0) {
            console.error('This doesn\'t seem to be a valid timetracker installation'.red);
            return this.askUrl();
          }
          rc.url = url;
          this.flushRc();
          return url;
        })
        .catch((error) => {
          const message = error.code === 'ENOTFOUND' ? 'URL could not be found' : (error.message || 'Unknown error');
          console.error(message.red);
          return this.askUrl();
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
          const formData = new URLSearchParams({ username, password, loginCookie: 'on' });
          httpClient.post(this.rc.url + '/login', formData)
            .then((response) => {
              if (response.status !== 302) {
                console.error('Invalid login'.red);
                return this.login().then(resolve);
              }
              resolve();
            })
            .catch((error) => {
              console.error(('Login error: ' + (error.message || error)).red);
              return this.login().then(resolve);
            });
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
      httpClient.get(rc.url + '/' + paths[type])
        .then((response) => {
          const entries = response.data
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
        })
        .catch((error) => {
          console.error((error.message || error).red);
          throw error;
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
