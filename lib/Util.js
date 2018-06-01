const readline = require('readline');
const Writable = require('stream').Writable;
const request = require('request');

let holidays

/**
 * Utilities
 *
 * @type {Util}
 */
module.exports = class Util {
  /**
   * Left pad numbers with 0
   *
   * @param {Number} num
   * @param {Number} size
   * @param {String} char
   * @return {string}
   */
  static pad(num, size, char) {
    let s = num + '';
    while (s.length < size) {
      s = (char || '0') + s;
    }
    return s;
  }

  /**
   * Format a date
   *
   * @param {Object} entry
   * @return {string}
   */
  static formatDate(entry) {
    return entry.year + '-' + Util.pad(entry.month, 2) + '-' + Util.pad(entry.day, 2);
  }

  /**
   * Format a time
   *
   * @param {Object|Number} time
   * @param {Boolean} ms
   * @return {string}
   */
  static formatTime(time, ms) {
    if (typeof time !== 'object') {
      time = parseInt(time)
      const hour = Math.floor(time / 60)
      const minute = time - (hour * 60)
      time = {hour, minute}
    }
    return Util.pad(time.hour, 2) + ':' + Util.pad(time.minute, 2) + (ms ? ':00' : '');
  }

  /**
   * Ask a question on CLI
   *
   * @param {String} question
   * @param {Boolean} hideInput
   * @return {Promise}
   */
  static ask (question, hideInput) {
    return new Promise((resolve) => {
      const mutableOutput = new Writable({
        write: function (chunk, encoding, callback) {
          if (!this.muted) {
            process.stdout.write(chunk, encoding)
          }
          callback()
        }
      })
      const rl = readline.createInterface({
        input: process.stdin,
        output: mutableOutput,
        terminal: true
      })
      rl.question(question, (answer) => {
        rl.close()
        if (hideInput) {
          console.log('')
        }
        resolve(answer)
      })
      mutableOutput.muted = hideInput
    })
  }

  static initHolidays(country, state) {
    return new Promise((resolve, reject) => {
      if (country !== 'de') {
        reject(new Error('Not supported'))
      } else {
        request.get('https://feiertage-api.de/api/?jahr=2018&nur_land=' + state.toUpperCase(), (error, res, body) => {
          if (error) {
            reject(error)
          } else {
            const h = {}
            Object.values(JSON.parse(body)).forEach(holiday => {
              h[holiday.datum] = true
            })
            holidays = h
            resolve(h)
          }
        })
      }

    })
  }

  static isHoliday(date) {
    if (!holidays) {
      throw new Error('Init holidays first')
    }
    if (date instanceof Date) {
      date = {year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate()}
    }
    return holidays.hasOwnProperty(Util.formatDate(date))
  }
};