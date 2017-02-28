'use strict';

module.exports = function(client) {
  var loadCommand = function(name) {
    var cmd = require('./' + name);
    cmd.register(client);
    return cmd.runner();
  };

  client.auth = {
    upload: loadCommand('auth-import'),
    export: loadCommand('auth-export')
  };

  client.database = {
    get: loadCommand('database-get'),
    push: loadCommand('database-push'),
    set: loadCommand('database-set'),
    remove: loadCommand('database-remove'),
    update: loadCommand('database-update'),
    profile: loadCommand('database-profile')
  };

  client.deploy = loadCommand('deploy');

  client.hosting = {
    disable: loadCommand('hosting-disable')
  };

  client.functions = {
    log: loadCommand('functions-log'),
    config: {
      clone: loadCommand('functions-config-clone'),
      get: loadCommand('functions-config-get'),
      set: loadCommand('functions-config-set'),
      unset: loadCommand('functions-config-unset')
    }
  };

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
