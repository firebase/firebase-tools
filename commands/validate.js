var validator = require('../lib/validator').firebase;
var FirebaseError = require('../lib/error');

module.exports = function(client) {
  var command = client.cli.command('validate')
    .description('check that your firebase.json is valid')

  var validate = function(options) {
    var json = require(process.cwd() + "/firebase.json");
    validator.validate(json).then(function() {
      client.logger.info("Your firebase.json is looking good!");
    }, client.errorOut);
  }

  command.action(validate);
  return validate;
}
