"use strict";

var FirebaseError = require("./error");
var cjson = require("cjson");

module.exports = function(path) {
  try {
    return cjson.load(path);
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new FirebaseError("File " + path + " does not exist", { exit: 1 });
    }
    throw new FirebaseError("Parse Error in " + path + ":\n\n" + e.message);
  }
};
