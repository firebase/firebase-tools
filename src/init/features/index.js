"use strict";
const { previews } = require("../../previews");

module.exports = {
  database: require("./database"),
  firestore: require("./firestore").doSetup,
  functions: require("./functions"),
  hosting: require("./hosting"),
  storage: require("./storage").doSetup,
  emulators: require("./emulators").doSetup,
  // always runs, sets up .firebaserc
  project: require("./project").doSetup,
};

if (previews.hostingchannels) {
  module.exports["hosting:github"] = require("./hosting/github").initGitHub;
}
