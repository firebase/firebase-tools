"use strict";

var _ = require("lodash");

var encodeFirestoreValue = function(data) {
  var isPlainObject = function(input) {
    return (
      typeof input === "object" &&
      input !== null &&
      _.isEqual(Object.getPrototypeOf(input), Object.prototype)
    );
  };

  var encodeHelper = function(val) {
    if (_.isString(val)) {
      return {
        stringValue: val,
      };
    }
    if (_.isBoolean(val)) {
      return {
        booleanValue: val,
      };
    }
    if (_.isInteger(val)) {
      return {
        integerValue: val,
      };
    }
    // Integers are handled above, the remaining numbers are treated as doubles
    if (_.isNumber(val)) {
      return {
        doubleValue: val,
      };
    }
    if (_.isDate(val)) {
      return {
        timestampValue: val.toISOString(),
      };
    }
    if (_.isArray(val)) {
      var encodedElements = [];
      for (var i = 0; i < val.length; ++i) {
        var enc = encodeHelper(val[i]);
        if (enc) {
          encodedElements.push(enc);
        }
      }
      return {
        arrayValue: {
          values: encodedElements,
        },
      };
    }
    if (_.isNil(val)) {
      return {
        nullValue: "NULL_VALUE",
      };
    }
    if (val instanceof Buffer || val instanceof Uint8Array) {
      return {
        bytesValue: val,
      };
    }
    if (isPlainObject(val)) {
      return {
        mapValue: {
          fields: encodeFirestoreValue(val),
        },
      };
    }
    throw new Error(
      "Cannot encode " +
        val +
        "to a Firestore Value." +
        " The emulator does not yet support Firestore document reference values or geo points."
    );
  };

  return _.mapValues(data, encodeHelper);
};

module.exports = encodeFirestoreValue;
