"use strict";

var _ = require("lodash");

var decodeFirestoreValue = function(data) {
  var decode = function(val) {
    let firestoreType = _.keys(val)[0];
    let value = _.values(val)[0];

    switch (firestoreType) {
      case "integerValue":
        return _.toInteger(value);

      case "doubleValue":
        return _.toNumber(value);

      case "mapValue":
        return decodeFirestoreValue(value);

      case "arrayValue":
        return "values" in value ? value.values.map((v) => decode(v)) : [];

      // all remaining types: stringValue, booleanValue, referenceValue, geoPointValue, nullValue, timestampValue
      default:
        return _.values(val)[0];
    }
  };

  if (!"fields" in data) {
    return {};
  }

  let decoded = {};

  for (let key in data.fields) {
    decoded[key] = decode(data.fields[key]);
  }

  return decoded;
};

module.exports = decodeFirestoreValue;
