"use strict";

var _ = require("lodash");
var is = require("is");

var encodeFirestoreValue = function(data) {
  var isPlainObject = function(input) {
    return (
      typeof input === "object" &&
      input !== null &&
      _.isEqual(Object.getPrototypeOf(input), Object.prototype)
    );
  };

  var encodeHelper = function(val) {
    if (is.string(val)) {
      return {
        stringValue: val,
      };
    }
    if (is.boolean(val)) {
      return {
        booleanValue: val,
      };
    }
    if (is.integer(val)) {
      return {
        integerValue: val,
      };
    }
    // Integers are handled above, the remaining numbers are treated as doubles
    if (is.number(val)) {
      return {
        doubleValue: val,
      };
    }
    if (is.date(val)) {
      return {
        timestampValue: val.toISOString(),
      };
    }
    if (is.array(val)) {
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
    if (is.nil(val)) {
      return {
        nullValue: "NULL_VALUE",
      };
    }
    if (is.instanceof(val, Buffer) || is.instanceof(val, Uint8Array)) {
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
