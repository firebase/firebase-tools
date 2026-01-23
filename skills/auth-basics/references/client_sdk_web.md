# Firebase Authentication Web SDK

## Initialization

First, ensure you have initialized the Firebase App (see `firebase-basics` skill). Then, initialize the Auth service:

```javascript
import { getAuth } from "firebase/auth";
import { app } from "./firebase"; // Your initialized Firebase App

const auth = getAuth(app);
export { auth };
```

## Connect to Emulator

If you are running the Authentication emulator (usually on port 9099), connect to it immediately after initialization.

```javascript
import { getAuth, connectAuthEmulator } from "firebase/auth";

const auth = getAuth();
// Connect to emulator if running locally
if (location.hostname === "localhost") {
  connectAuthEmulator(auth, "http://localhost:9099");
}
```

## Sign Up with Email/Password

```javascript
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

const auth = getAuth();
createUserWithEmailAndPassword(auth, email, password)
  .then((userCredential) => {
    // Signed in 
    const user = userCredential.user;
    // ...
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
    // ..
  });
```

## Sign In with Email/Password

```javascript
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const auth = getAuth();
signInWithEmailAndPassword(auth, email, password)
  .then((userCredential) => {
    // Signed in 
    const user = userCredential.user;
    // ...
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
  });
```

## Sign In with Google (Popup)

```javascript
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";

const auth = getAuth();
const provider = new GoogleAuthProvider();

signInWithPopup(auth, provider)
  .then((result) => {
    // This gives you a Google Access Token. You can use it to access the Google API.
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential.accessToken;
    // The signed-in user info.
    const user = result.user;
    // ...
  })
  .catch((error) => {
    // Handle Errors here.
    const errorCode = error.code;
    const errorMessage = error.message;
    // ...
  });
```

## Observe Auth State

Recommended way to get the current user. This listener triggers whenever the user signs in or out.

```javascript
import { getAuth, onAuthStateChanged } from "firebase/auth";

const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in, see docs for a list of available properties
    // https://firebase.google.com/docs/reference/js/firebase.User
    const uid = user.uid;
    // ...
  } else {
    // User is signed out
    // ...
  }
});
```

## Sign Out

```javascript
import { getAuth, signOut } from "firebase/auth";

const auth = getAuth();
signOut(auth).then(() => {
  // Sign-out successful.
}).catch((error) => {
  // An error happened.
});
```
