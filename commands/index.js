module.exports = function(client) {
  client.serve    = require('./serve')(client);
  client.validate = require('./validate')(client);
  return client;
};
