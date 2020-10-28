if (typeof firebase === 'undefined') {
  throw new Error('hosting/init-error: Firebase SDK not detected. You must include it before /__/firebase/initEmulators.js');
}

if (firebase.apps.length === 0) {
  throw new Error('hosting/init-error: Firebase app not detected. You must call initializeApp before /__/firebase/initEmulators.js');
}

/*--EMULATORS--*/
if (firebaseEmulators) {
  console.warn("Automatically connecting Firebase SDKs to running emulators:");
  Object.keys(firebaseEmulators).forEach(function(key) {
    console.warn('\t' + key + ': http://' +  firebaseEmulators[key].host + ':' + firebaseEmulators[key].port );
  });

  if (firebaseEmulators.database && typeof firebase.database === 'function') {
    firebase.database().useEmulator(firebaseEmulators.database.host, firebaseEmulators.database.port);
  }

  if (firebaseEmulators.firestore && typeof firebase.firestore === 'function') {
    firebase.firestore().useEmulator(firebaseEmulators.firestore.host, firebaseEmulators.firestore.port);
  }

  if (firebaseEmulators.functions && typeof firebase.functions === 'function') {
    firebase.functions().useEmulator(firebaseEmulators.functions.host, firebaseEmulators.functions.port);
  }

  if (firebaseEmulators.auth && typeof firebase.auth === 'function') {
    firebase.auth().useEmulator('http://' + firebaseEmulators.auth.host + ':' + firebaseEmulators.auth.port);
  }
}
