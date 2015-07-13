'use strict';

module.exports = function(client) {
  var loadCommand = function(name) {
    var cmd = require('./' + name);
    cmd.register(client);
    return cmd.getAction();
  };

  client.login = loadCommand('login');
  client.serve = loadCommand('serve');
  client.validate = loadCommand('validate');

  return client;
};
