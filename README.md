# TTEFSL - TimeTracker entries from system logs

Command line utility to create TimeTracker log entries from your system logs. This is useful if your computers uptime correlates with your working hours.

<kbd>![](res/logging.gif?raw=true)</kbd>

This is what it does for you:

- Find start/end times by adequate event ids from Windows Event Log Reader (Linux and MacOS may be added in future)
- Automatically add breaks (a given number of minutes on a given hour, by default 30min on 12 P.M.)
- Add break duration to working hours if wanted (off by default)
- Times are rounded to a changeable accuracy (5 minutes by default)
- Show preview of the logs (default behaviour)
- Log to TimeTracker (with `-w`/`--write` option):
    - User is asked for TimeTracker URL, username and password
    - User is asked for customer, project and activity
    - All input will be saved in a rc file as defaults for next execution (where user can then change those defaults if needed)
    

## Installation

```
git clone https://github.com/netresearch/ttefsl.git ttefsl
cd ttefsl
npm install
```

## Usage

```
  Usage: ttefsl [options]

  Create TimeTracker log entries from your system log

  Options:

    -h, --help            output usage information
    -V, --version         output the version number
    -w, --write           Actually write to TimeTracker - if not provided, preview is displayed
    -m, --month <n>       Month of the year to use (starting at 1)
    --start-ids <ids>     Event IDs for system start
    --stop-ids <ids>      Event IDs for system stop
    --break <minutes>     Add break
    --break-at <hours>    Add break this number of hours after midnight
    --append-break        Wether break time should be appended to day hours
    --accuracy <minutes>  Accuracy of time entries in minutes
```

### Preview

Unless you executed ttefsl with the `-w`/`--write` option, it will show you a list of the generated entries for the given month and won't write anything.

## Todos

- Overlapping days (computer wasn't off) are currently shown as a warning and ignored from there on. It would be better if the user would be asked for the missing start and end times instead.
- MacOS support
- Linux support
- Installer and UI for non CLI guys
