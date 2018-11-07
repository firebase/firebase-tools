"use strict";

var cjson = require("cjson");
var _ = require("lodash");

module.exports = function(rules) {
  var parsed = cjson.parse(rules);
  return _.has(parsed, "rules");
};
