var chalk = require('chalk');

module.exports = function(client, error) {
  if (error.children.length) {
    client.logger.error(chalk.underline(error.message) + ":");
    error.children.forEach(function(child) {
      var out = "- ";
      if (child.name) out += chalk.bold(child.name) + " ";
      out += child.message;
      client.logger.error(out);
    });
  } else {
    client.logger.error(error.message);
  }
  process.exit(1);
};
