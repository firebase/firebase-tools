'use strict';

module.exports = function(client) {
  var loadCommand = function(name) {
    var cmd = require('./' + name);
    cmd.register(client);
    return cmd.getAction();
  };

  client.init = loadCommand('init');
  client.list = loadCommand('list');
  client.login = loadCommand('login');
  client.logout = loadCommand('logout');
  client.serve = loadCommand('serve');
  client.validate = loadCommand('validate');

  return client;
};
