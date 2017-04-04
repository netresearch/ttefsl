const readline = require('readline');
const Writable = require('stream').Writable;

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

  /**
   * Takeover entries (group by day, add breaks)
   *
   * @param rawEntries
   */
  setEntries(rawEntries) {
    const byDay = {};
    rawEntries.forEach((entry) => {
      const fromDay = [entry.from.getFullYear(), entry.from.getMonth() + 1, entry.from.getDate()].join('-');
      const toDay = [entry.to.getFullYear(), entry.to.getMonth() + 1, entry.to.getDate()].join('-');
      if (fromDay !== toDay) {
        console.warn(('Detected invalid activity range from ' + fromDay + ' until ' + toDay).red);
        console.warn('Ignoring this entry - DIY'.red);
        // @TODO: Ask user for end of entry.from and start of entry.to
        return;
      }
      if (!byDay[fromDay]) {
        byDay[fromDay] = Object.assign({}, entry);
      } else {
        byDay[fromDay].to = entry.to;
      }
    });

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
      if (this.break && dayLength > this.break && start < this.breakAt + this.break) {
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