'use strict';

module.exports = {
  database: require('./database'),
  firestore: require('./firestore'),
  functions: require('./functions'),
  hosting: require('./hosting'),
  storage: require('./storage'),
  // always runs, sets up .firebaserc
  project: require('./project')
};
