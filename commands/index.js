'use strict';

module.exports = function(client) {
  var loadCommand = function(name) {
    var cmd = require('./' + name);
    cmd.register(client);
    return cmd.runner();
  };

  client.collab = loadCommand('collab');
  client.collab.invite = loadCommand('collab-invite');
  client.collab.remove = loadCommand('collab-remove');
  client.data = {
    get: loadCommand('data-get')
  };
  client.deploy = loadCommand('deploy');
  client.deploy.empty = loadCommand('deploy-empty');
  client.help = loadCommand('help');
  client.init = loadCommand('init');
  client.list = loadCommand('list');
  client.login = loadCommand('login');
  client.logout = loadCommand('logout');
  client.open = loadCommand('open');
  client.serve = loadCommand('serve');
  client.validate = loadCommand('validate');

  return client;
};
