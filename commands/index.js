'use strict';

module.exports = function(client) {
  var loadCommand = function(name) {
    var cmd = require('./' + name);
    cmd.register(client);
    return cmd.runner();
  };

  client.blank = loadCommand('blank');
  client.bootstrap = loadCommand('bootstrap');
  client.collab = loadCommand('collab');
  client.collab.add = loadCommand('collab-add');
  client.deploy = loadCommand('deploy');
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
