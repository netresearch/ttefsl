const AbstractLogger = require('./Abstract');
const TimeTracker = require('../TimeTracker');

/**
 * Log to timetracker
 *
 * @type {PreviewLogger}
 */
module.exports = class TimeTrackerLogger extends AbstractLogger {
  init () {
    this.tt = new TimeTracker()
  }

  flush() {
    this.tt.flush(this.entries)
  }
};