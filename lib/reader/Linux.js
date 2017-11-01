const AbstractReader = require('./Abstract');
const execSync = require('child_process').execSync;
const fs = require('fs');
const user = require("os").userInfo();

const ISO_REGEX = /([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+[0-9]{4})/g;

/**
 * Read entries from windows system log
 *
 * @type {WindowsReader}
 */
module.exports = class LinuxReader extends AbstractReader {
  getWtmpFiles() {
    const files = [];
    fs.readdirSync('/var/log').forEach((file) => {
      if (file === "wtmp" || file.match(/^wtmp\.[0-9]+/)) {
        files.unshift("/var/log/" + file);
      }
    });
    return files;
  }

  executeLast(file) {
    const format = (date) => {
      return date.getUTCFullYear()
        + "-" + ('0' + (date.getMonth() + 1)).slice(-2)
        + "-" + ('0' + date.getDate()).slice(-2)
        + " " + ('0' + date.getHours()).slice(-2)
        + ":" + ('0' + date.getMinutes()).slice(-2);
    };
    const cmd = "last -R --time-format iso -f '" + file + "' '" + user.username + "'"
      + " -s '" + format(this.from) + "'"
      + " -t '" + format(this.to) + "'";

    return execSync(cmd).toString('utf8');
  }

  parseDate(dateString) {
    const date = new Date(dateString);
    const addHours = parseInt(/([-+][0-9]{2})[0-9]{2}$/.exec(dateString)[1]);
    date.setHours(date.getHours() + addHours);
    return date;
  }

  read() {
    return new Promise((resolve) => {
      const entries = [];
      this.getWtmpFiles().forEach((file) => {
        this.executeLast(file).split("\n").reverse().forEach((line) => {
          if (line.substr(0, user.username.length) === user.username) {
            let match = ISO_REGEX.exec(line);
            if (match) {
              const from = this.parseDate(match[1]);
              let to;
              if (match = ISO_REGEX.exec(line)) {
                to = this.parseDate(match[1]);
              } else if (match = /\((([0-9]+)\+)?([0-9]+):([0-9]+)\)$/.exec(line)) {
                to = new Date(from.getTime() + (((match[2] ? parseInt(match[2]) : 0) * 24 + parseInt(match[3])) * 60 + parseInt(match[4])) * 60 * 1000);
              }
              entries.push({from, to});
            }
          }
        });
        //console.log(this.executeLast(file));
      });
      resolve(entries);
    });
  }
}