'use strict';

var previews = require('../lib/previews');

module.exports = function(client) {
  var loadCommand = function(name) {
    var cmd = require('./' + name);
    cmd.register(client);
    return cmd.runner();
  };

  client.auth = {
    upload: loadCommand('auth-import')
  };

  client.database = {
    get: loadCommand('database-get'),
    push: loadCommand('database-push'),
    set: loadCommand('database-set'),
    remove: loadCommand('database-remove'),
    update: loadCommand('database-update')
  };

  client.deploy = loadCommand('deploy');

  client.hosting = {
    disable: loadCommand('hosting-disable')
  };

  if (previews.functions) {
    client.env = {
      clone: loadCommand('env-clone'),
      get: loadCommand('env-get'),
      set: loadCommand('env-set'),
      unset: loadCommand('env-unset')
    };

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
  client.serve = loadCommand('serve');

  client.tools = {
    migrate: loadCommand('tools-migrate')
  };

  client.use = loadCommand('use');

  return client;
};
