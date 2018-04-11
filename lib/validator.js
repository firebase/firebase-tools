"use strict";

var JSONSchema = require("jsonschema");
var jsonschema = new JSONSchema.Validator();
var request = require("request");

var FirebaseError = require("./error");

var NAMED_SCHEMAS = {
  firebase:
    "https://gist.githubusercontent.com/mbleigh/6040df46f12f349889b2/raw/1c11a6e00a7295c84508dca80f2c92b00ba44006/firebase-schema.json",
};

var Validator = function(url) {
  this._validateQueue = [];

  var self = this;
  request.get(url, function(err, response, body) {
    if (!err && response.statusCode === 200) {
      self.schema = JSON.parse(body);
      self._process();
    }
  });
};

Validator.prototype.validate = function(data) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self._validateQueue.push({
      data: data,
      resolve: resolve,
      reject: reject,
    });
    self._process();
  });
};

Validator.prototype._process = function() {
  if (!this.schema) {
    return;
  }
  while (this._validateQueue.length) {
    var item = this._validateQueue.shift();
    var result = jsonschema.validate(item.data, this.schema);

    var err = new FirebaseError("Your document has validation errors", {
      children: this._decorateErrors(result.errors),
      exit: 2,
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
    error.name = error.property.replace(/^instance/, "root");
  });
  return errors;
};

for (var name in NAMED_SCHEMAS) {
  if ({}.hasOwnProperty.call(NAMED_SCHEMAS, name)) {
    Validator[name] = new Validator(NAMED_SCHEMAS[name]);
  }
}

module.exports = Validator;
