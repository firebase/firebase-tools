if (typeof firebase === 'undefined') throw new Error('hosting/init-error: Firebase SDK not detected. You must include it before /__/firebase/init.js');
/*--CONFIG--*/
if (firebaseConfig) {
  firebase.initializeApp(firebaseConfig);
}
