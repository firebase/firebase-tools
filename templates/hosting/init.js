if (typeof firebase === 'undefined') throw new Error('hosting/init-error: Firebase SDK not detected. You must include it before /__/firebase/init.js');
function hasFirebaseFeature(feature) {
  return firebase && typeof firebase[feature] === "function";
}
/*--CONFIG--*/
/*--EMULATORCONFIG--*/
if (firebaseConfig) {
  // Database has to be configured *before* initializeApp, while others can be configured after.
  if (emulatorConfig.database) {
    console.log("Configuring Database SDK to point at emulator: " + emulatorConfig.database);
    firebaseConfig.databaseURL = emulatorConfig.database
  }

  firebase.initializeApp(firebaseConfig);

  if (emulatorConfig) {
    if (hasFirebaseFeature("firestore") && emulatorConfig.firestore) {
      console.log("Configuring Firestore SDK to point at emulator: " + emulatorConfig.firestore);
      firebase.firestore().settings({
        host: emulatorConfig.firestore,
        ssl: false
      });
    }

    if (hasFirebaseFeature("functions") && emulatorConfig.functions) {
      console.log("Configuring Functions SDK to point at emulator: " + emulatorConfig.functions);
      firebase.functions().useFunctionsEmulator(emulatorConfig.functions);
    }
  }
}