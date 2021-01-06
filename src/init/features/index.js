"use strict";

module.exports = {
  database: require("./database").doSetup,
  firestore: require("./firestore").doSetup,
  functions: require("./functions"),
  hosting: require("./hosting"),
  storage: require("./storage").doSetup,
  emulators: require("./emulators").doSetup,
  // always runs, sets up .firebaserc
  project: require("./project").doSetup,
  remoteconfig: require("./remoteconfig").doSetup,
  "hosting:github": require("./hosting/github").initGitHub,
};
