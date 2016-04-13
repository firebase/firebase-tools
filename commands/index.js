'use strict';

var previews = require('../lib/previews');

module.exports = function(client) {
  var loadCommand = function(name) {
    var cmd = require('./' + name);
    cmd.register(client);
    return cmd.runner();
  };

  client.data = {
    get: loadCommand('data-get'),
    push: loadCommand('data-push'),
    set: loadCommand('data-set'),
    remove: loadCommand('data-remove'),
    update: loadCommand('data-update')
  };

  client.deploy = loadCommand('deploy');

  client.disable = {
    hosting: loadCommand('disable-hosting')
  };

  if (previews.functions) {
    client.functions = {
      log: loadCommand('functions-log')
    };
  }

  client.help = loadCommand('help');
  client.init = loadCommand('init');
  client.list = loadCommand('list');

  client.login = loadCommand('login');
  client.login.ci = loadCommand('login-ci');

  client.logout = loadCommand('logout');
  client.open = loadCommand('open');

  client.prefs = {
    token: loadCommand('prefs-token')
  };

  client.serve = loadCommand('serve');

  client.tools = {
    migrate: loadCommand('tools-migrate')
  };

  client.use = loadCommand('use');

  return client;
};
