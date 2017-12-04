const readline = require('readline');
const Writable = require('stream').Writable;
const Util = require('../Util');

/**
 * Base logger for concrete implementations
 *
 * @type {AbstractLogger}
 */
module.exports = class AbstractLogger {
  /**
   * Construct - takeover command
   *
   * @param {Command} command
   */
  constructor(command) {
    this.command = command;
    this.entries = [];
    this.init();
  }

  /**
   * Init - override to initialize your logger
   */
  init() {
  }

  /**
   * Add options to the command
   *
   * @param {Command} command
   */
  static configureCommand(command) {
    command.option('--break <minutes>', 'Add break', parseInt, 30);
    command.option('--break-at <hours>', 'Add break this number of hours after midnight', parseInt, 12);
    command.option('--append-break', 'Wether break time should be appended to day hours');
    command.option('--accuracy <minutes>', 'Accuracy of time entries in minutes', parseInt, 5);
  }

  /**
   * Configure this instance (after argv was parsed) - override if needed
   */
  configure() {
    this.break = this.command.break;
    this.breakAt = this.command.breakAt * 60;
    this.appendBreak = this.command.appendBreak;
    this.accuracy = this.command.accuracy;
  }

  /**
   * Ask a question on CLI
   *
   * @param {String} question
   * @param {Boolean} hideInput
   * @return {Promise}
   */
  ask(question, hideInput) {
    return new Promise((resolve) => {
      const mutableOutput = new Writable({
        write: function (chunk, encoding, callback) {
          if (!this.muted) {
            process.stdout.write(chunk, encoding);
          }
          callback();
        }
      });
      const rl = readline.createInterface({
        input: process.stdin,
        output: mutableOutput,
        terminal: true
      });
      rl.question(question, (answer) => {
        rl.close();
        if (hideInput) {
          console.log('');
        }
        resolve(answer);
      });
      mutableOutput.muted = hideInput;
    });
  }

  formatDate(date, withTime) {
    let formatted = date.getUTCFullYear()
      + '-' + Util.pad(date.getUTCMonth() + 1, 2)
      + '-' + Util.pad(date.getUTCDate(), 2);
    if (!withTime) {
      return formatted;
    }
    const length = Math.round((date.getUTCHours() * 60 + date.getUTCMinutes()) / this.accuracy) * this.accuracy;
    const hours = Math.floor(length / 60);
    const minutes = length - (hours * 60);
    return formatted + ' ' + Util.pad(hours, 2) + ':' + Util.pad(minutes, 2);
  }

  autoFix(entries) {
    const newEntries = [];
    const f = (date) => this.formatDate(date, true);
    const fd = (date) => this.formatDate(date);
    const dropped = [];
    entries.forEach((entry, i) => {
      if (i === 0 || i === entries.length - 1) {
        newEntries.push(entry);
        return;
      }
      if (fd(entry.from) !== fd(entry.to) && f(entry.from) === f(entries[i - 1].to) && f(entry.to) === f(entries[i + 1].from)) {
        dropped.push(entry);
      } else {
        newEntries.push(entry);
      }
    });
    if (dropped.length) {
      console.log('Ignoring following entries as they occure to be downtime:'.yellow);
      dropped.forEach((d) => console.log(`  - ${f(d.from)} - ${f(d.to)}`.yellow))
    }
    return newEntries;
  }

  getEntriesByDay(entries) {
    const byDay = {};
    const invalid = [];
    entries.forEach((e) => {
      const entry = Object.assign({}, e);
      const fromDay = this.formatDate(entry.from);
      const toDay = this.formatDate(entry.to);
      if (fromDay !== toDay) {
        invalid.push(entry);
        // @TODO: Ask user for end of entry.from and start of entry.to
        return;
      }
      if (!byDay[fromDay]) {
        byDay[fromDay] = entry;
      } else {
        byDay[fromDay].to = entry.to;
      }
    });
    if (invalid.length) {
      const f = (date) => this.formatDate(date, true);
      console.log('Ignoring following entries as they span two or more days:'.red);
      invalid.forEach((i) => console.log(`  - ${f(i.from)} - ${f(i.to)}`.red));
    }
    return byDay;
  }

  /**
   * Takeover entries (group by day, add breaks)
   *
   * @param rawEntries
   */
  setEntries(rawEntries) {
    const byDay = this.getEntriesByDay(this.autoFix(rawEntries));

    Object.keys(byDay).forEach((key) => {
      const entry = byDay[key];
      const addEntry = (start, length) => {
        const fromHours = Math.floor(start / 60);
        const fromMinutes = start - (fromHours * 60);
        const to = start + length;
        const toHours = Math.floor(to / 60);
        const toMinutes = to - toHours * 60;
        this.entries.push({
          day: entry.from.getUTCDate(),
          month: entry.from.getUTCMonth() + 1,
          year: entry.from.getUTCFullYear(),
          from: {
            hour: fromHours,
            minute: fromMinutes
          },
          to: {
            hour: toHours,
            minute: toMinutes
          },
        });
      };
      let start = Math.round((entry.from.getUTCHours() * 60 + entry.from.getUTCMinutes()) / this.accuracy) * this.accuracy;
      const end = Math.round((entry.to.getUTCHours() * 60 + entry.to.getUTCMinutes()) / this.accuracy) * this.accuracy;
      let dayLength = Math.max(this.accuracy, end - start);
      if (this.break && dayLength > this.break && start < this.breakAt + this.break && end > this.breakAt + this.break) {
        if (start < this.breakAt) {
          addEntry(start, this.breakAt - start);
        }
        if (!this.appendBreak) {
          dayLength -= this.breakAt + this.break - start;
        }
        start = this.breakAt + this.break;
      }
      addEntry(start, dayLength);
    });
  }
};