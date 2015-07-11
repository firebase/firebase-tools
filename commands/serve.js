var superstatic = require('superstatic').server;
var chalk = require('chalk');

module.exports = function(client) {
  var command = client.cli.command('serve')
    .description('start a local server for your static assets')
    .option('-p, --port <port>', 'the port on which to listen', 5000)
    .option('-o, --host <host>', 'the host on which to listen', 'localhost');

  var serve = function(options) {
    superstatic({
      debug: true,
      port: options.port,
      host: options.host
    }).listen();

    client.logger.info("Listening at",chalk.underline(chalk.bold("http://" + options.host + ":" + options.port)));
  }

  command.action(serve);
  return serve;
}
