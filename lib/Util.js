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
   * @return {string}
   */
  static pad(num, size) {
    let s = num + '';
    while (s.length < size) {
      s = '0' + s;
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
   * @param {Object} time
   * @param {Boolean} ms
   * @return {string}
   */
  static formatTime(time, ms) {
    return Util.pad(time.hour, 2) + ':' + Util.pad(time.minute, 2) + (ms ? ':00' : '');
  }
};