var JSCK = require('jsck');
var request = require('request');
var RSVP = require('rsvp');
var chalk = require('chalk');
var FirebaseError = require('./error');

var NAMED_SCHEMAS = {
  firebase: "https://gist.githubusercontent.com/mbleigh/6040df46f12f349889b2/raw/1c11a6e00a7295c84508dca80f2c92b00ba44006/firebase-schema.json"
};

var Validator = function(url) {
  this._validateQueue = [];

  var self = this;
  request.get(url, function(err, response, body) {
      if (!err && response.statusCode === 200) {
        self.schema = new JSCK.draft4(JSON.parse(body));
        self._process();
      }
    });
};

Validator.prototype.validate = function(data) {
  return new RSVP.Promise(function(resolve, reject) {
    this._validateQueue.push({
      data: data,
      resolve: resolve,
      reject: reject
    });
    this._process();
  }.bind(this));
};

Validator.prototype._process = function() {
  if (!this.schema) return;
  while (this._validateQueue.length) {
    var item = this._validateQueue.shift();
    var result = this.schema.validate(item.data);

    var err = new FirebaseError("Your document has validation errors", {
      children: this._decorateErrors(result.errors)
    });

    if (result.valid) {
      item.resolve();
    } else {
      item.reject(err);
    }
  }
};

Validator.prototype._decorateErrors = function(errors) {
  errors.forEach(function(error) {
    error.name = error.document.pointer.substring(2).replace("/",".");
    error.message = "is invalid";
  });
  return errors;
};

for (var name in NAMED_SCHEMAS) {
  Validator[name] = new Validator(NAMED_SCHEMAS[name]);
}

module.exports = Validator;
