"use strict";

module.exports = {
  database: require("./database"),
  firestore: require("./firestore").doSetup,
  functions: require("./functions"),
  hosting: require("./hosting"),
  storage: require("./storage").doSetup,
  // always runs, sets up .firebaserc
  project: require("./project").doSetup,
};
