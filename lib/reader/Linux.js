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
    const utcMatch = /([-+][0-9]{2})[0-9]{2}$/.exec(dateString);
    if (utcMatch) {
      const addHours = parseInt(utcMatch[1]);
      date.setHours(date.getHours() + addHours);
    }
    return date;
  }

  addWtmpEntries(entries) {
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
    });
  }

  addTuptimeEntries(entries) {
    let list;
    try {
      list = execSync('tuptime -l -d \'%Y-%m-%dT%H:%M:%SZ%z\'').toString('utf8');
    } catch (e) {
      return;
    }
    let lastIndex = 0;
    while (true) {
      const index = list.indexOf("\n\n", lastIndex);
      if (index === -1) {
        break;
      }
      const portion = list.substring(lastIndex, index);
      const fromMatch = /^Startup:\s+[0-9]+\s+at\s+(.+)$/m.exec(portion);
      const toMatch = /^Shutdown:\s+.+\s+at\s+(.+)$/m.exec(portion);
      if (fromMatch && toMatch) {
        const from = this.parseDate(fromMatch[1]);
        const to = this.parseDate(toMatch[1]);
        if (from >= this.from || to > this.to && to <= this.to) {
          entries.push({from: from < this.from ? this.from : from, to: to > this.to ? this.to : to});
        }
      }
      lastIndex = index + 2;
    }
  }

  unite(entries) {
    entries.sort((a, b) => a.from - b.from);
    const newEntries = [];
    for (let i = 0; i < entries.length; i++) {
      let topFrom = entries[i].from;
      let topTo = entries[i].to;
      for (let j = i + 1; j < entries.length; j++) {
        const subFrom = entries[j].from;
        const subTo = entries[j].to;
        if (subFrom < topTo && subTo > topTo) {
          entries[j].from = topTo;
        }
      }
    }
  }

  addMissingTos(entries) {
    entries.forEach((entry) => {
      if (!entry.to) {
        entry.to = new Date()
      }
    })
  }

  read() {
    return new Promise((resolve) => {
      const entries = [];
      this.addWtmpEntries(entries);
      this.addTuptimeEntries(entries);
      this.unite(entries);
      this.addMissingTos(entries);
      resolve(entries);
    });
  }
}