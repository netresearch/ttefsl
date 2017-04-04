/**
 * Base reader for concrete implementations
 *
 * @type {AbstractReader}
 */
module.exports = class AbstractReader {
  /**
   * Construct - set options on command
   * 
   * @param {Command} command
   */
  constructor(command) {
    this.command = command;
    
    command.option(
      '-m, --month <n>', 
      'Month of the year to use (starting at 1)',
      parseInt,
      new Date().getMonth() || 12
    );
    this.configureCommand();
  }

  /**
   * Configure this.command - override if needed
   */
  configureCommand() {
  }

  /**
   * Configure this instance (after argv was parsed) - override if needed
   */
  configure() {
    const date = new Date();
    const month = this.command.month;
    const year = date.getFullYear() - (month > date.getMonth() + 1 ? 1 : 0);
    this.from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    this.to = new Date(year, month, 0, 23, 59, 59, 999);
  }
};