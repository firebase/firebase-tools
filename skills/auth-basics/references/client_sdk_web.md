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
    const user = userCredential.user;
    // ...
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
    // ..
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

## Sign In with Facebook (Popup)

```javascript
import { getAuth, signInWithPopup, FacebookAuthProvider } from "firebase/auth";

const auth = getAuth();
const provider = new FacebookAuthProvider();

signInWithPopup(auth, provider)
  .then((result) => {
    // The signed-in user info.
    const user = result.user;
    // This gives you a Facebook Access Token. You can use it to access the Facebook API.
    const credential = FacebookAuthProvider.credentialFromResult(result);
    const accessToken = credential.accessToken;
  })
  .catch((error) => {
    // Handle Errors here.
  });
```

## Sign In with Apple (Popup)

```javascript
import { getAuth, signInWithPopup, OAuthProvider } from "firebase/auth";

const auth = getAuth();
const provider = new OAuthProvider('apple.com');

signInWithPopup(auth, provider)
  .then((result) => {
    const user = result.user;
    // Apple credential
    const credential = OAuthProvider.credentialFromResult(result);
    const accessToken = credential.accessToken;
  })
  .catch((error) => {
    // Handle Errors here.
  });
```

## Sign In with Twitter (Popup)

```javascript
import { getAuth, signInWithPopup, TwitterAuthProvider } from "firebase/auth";

const auth = getAuth();
const provider = new TwitterAuthProvider();

signInWithPopup(auth, provider)
  .then((result) => {
    const user = result.user;
    // Twitter credential
    const credential = TwitterAuthProvider.credentialFromResult(result);
    const token = credential.accessToken;
    const secret = credential.secret;
  })
  .catch((error) => {
    // Handle Errors here.
  });
```

## Sign In with GitHub (Popup)

```javascript
import { getAuth, signInWithPopup, GithubAuthProvider } from "firebase/auth";

const auth = getAuth();
const provider = new GithubAuthProvider();

signInWithPopup(auth, provider)
  .then((result) => {
    const user = result.user;
    const credential = GithubAuthProvider.credentialFromResult(result);
    const token = credential.accessToken;
  })
  .catch((error) => {
    // Handle Errors here.
  });
```

## Sign In with Microsoft (Popup)

```javascript
import { getAuth, signInWithPopup, OAuthProvider } from "firebase/auth";

const auth = getAuth();
const provider = new OAuthProvider('microsoft.com');

signInWithPopup(auth, provider)
  .then((result) => {
    const user = result.user;
    const credential = OAuthProvider.credentialFromResult(result);
    const accessToken = credential.accessToken;
  })
  .catch((error) => {
    // Handle Errors here.
  });
```

## Sign In with Yahoo (Popup)

```javascript
import { getAuth, signInWithPopup, OAuthProvider } from "firebase/auth";

const auth = getAuth();
const provider = new OAuthProvider('yahoo.com');

signInWithPopup(auth, provider)
  .then((result) => {
    const user = result.user;
    const credential = OAuthProvider.credentialFromResult(result);
    const accessToken = credential.accessToken;
  })
  .catch((error) => {
    // Handle Errors here.
  });
```

## Sign In Anonymously

```javascript
import { getAuth, signInAnonymously } from "firebase/auth";

const auth = getAuth();
signInAnonymously(auth)
  .then(() => {
    // Signed in..
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
  });
```

## Email Link Authentication

**1. Send Auth Link**

```javascript
import { getAuth, sendSignInLinkToEmail } from "firebase/auth";

const auth = getAuth();
const actionCodeSettings = {
  // URL you want to redirect back to. The domain must be in the authorized domains list in Firebase Console.
  url: 'https://www.example.com/finishSignUp?cartId=1234',
  handleCodeInApp: true,
};

sendSignInLinkToEmail(auth, email, actionCodeSettings)
  .then(() => {
    // Save the email locally so you don't need to ask the user for it again
    window.localStorage.setItem('emailForSignIn', email);
  })
  .catch((error) => {
    // Error
  });
```

**2. Complete Sign In (on landing page)**

```javascript
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";

const auth = getAuth();

if (isSignInWithEmailLink(auth, window.location.href)) {
  let email = window.localStorage.getItem('emailForSignIn');
  if (!email) {
    email = window.prompt('Please provide your email for confirmation');
  }

  signInWithEmailLink(auth, email, window.location.href)
    .then((result) => {
      window.localStorage.removeItem('emailForSignIn');
      // You can check result.user
    })
    .catch((error) => {
      // Error
    });
}
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
