const AbstractLogger = require('./Abstract');
const Util = require('../Util');

/**
 * Just show a list with the entries to be logged
 *
 * @type {PreviewLogger}
 */
module.exports = class PreviewLogger extends AbstractLogger {
  /**
   * Just show a list with the entries to be logged
   */
  flush() {
    this.entries.forEach((entry) => {
      console.log(
        Util.formatDate(entry),
        Util.formatTime(entry.from),
        Util.formatTime(entry.to)
      );
    });
  }
};