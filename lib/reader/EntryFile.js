const AbstractReader = require('./Abstract');
const fs = require('fs');

module.exports = class EntryFileReader extends AbstractReader {
  read() {
    const contents = fs.readFileSync('ttefsl-entries.txt', {encoding: 'UTF-8'});
    const lines = contents.split("\n");
    const events = [];
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i].trim().split(';');
      if (row.length !== 3) {
        console.warn('Invalid line ' + (i + 1) + ': Wrong number of columns');
        continue;
      }
      const date = new Date(row[0]);
      if (!date) {
        console.warn('Invalid date format on line ' + (i + 1));
        continue;
      }
      const entry = {};
      for (let type of ['from', 'to']) {
        const time = row[type === 'from' ? 1 : 2].trim().split(':')
          .map(function(n) { return parseInt(n)})
          .filter(function(item) { return !isNaN(item); });
        if (time.length !== 2) {
          console.warn('Invalid time format for "' + type + '" on line ' + (i + 1));
          continue;
        }
        entry[type] = new Date(date.getTime());
        entry[type].setUTCHours(time[0], time[1]);
      }
      events.push(entry);
    }
    return Promise.resolve(events);
  }
};