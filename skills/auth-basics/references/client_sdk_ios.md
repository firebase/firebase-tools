# Firebase Authentication iOS SDK

## Initialization

First, ensure you have [added Firebase to your Apple project](https://firebase.google.com/docs/ios/setup).


In your `App` struct or `AppDelegate`:

```swift
import SwiftUI
import FirebaseCore
import FirebaseAuth

class AppDelegate: NSObject, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    FirebaseApp.configure()
    return true
  }
}

@main
struct YourApp: App {
  // register app delegate for Firebase setup
  @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate

  var body: some Scene {
    WindowGroup {
      NavigationView {
        ContentView()
      }
    }
  }
}
```

## Connect to Emulator



```swift
// Connect to emulator. Add this in your App Delegate or just after FirebaseApp.configure()
Auth.auth().useEmulator(withHost:"127.0.0.1", port:9099)
```

## Sign Up with Email/Password


```swift
Auth.auth().createUser(withEmail: email, password: password) { authResult, error in
  if let error = error {
    print("Error created user: \(error.localizedDescription)")
    return
  }
  // User signed in
  let user = authResult?.user
  print("User created: \(user?.email ?? "")")
}
```

## Sign In with Google
Requires `GoogleSignIn` dependency.


```swift
import GoogleSignIn
import FirebaseAuth

func signInWithGoogle() {
    guard let clientID = FirebaseApp.app()?.options.clientID else { return }
    let config = GIDConfiguration(clientID: clientID)
    
    GIDSignIn.sharedInstance.signIn(with: config, presenting: self) { user, error in
        if let error = error { return }
        guard let authentication = user?.authentication, let idToken = authentication.idToken else { return }
        
        let credential = GoogleAuthProvider.credential(withIDToken: idToken,
                                                     accessToken: authentication.accessToken)
        
        Auth.auth().signIn(with: credential) { authResult, error in
            if let error = error {
                // Handle error
                return
            }
            // User is signed in
        }
    }
}
```

## Sign In with Facebook


```swift
let provider = OAuthProvider(providerID: "facebook.com")
provider.customParameters = [
    "display": "popup"
]

provider.getCredentialWith(nil) { credential, error in
    if let error = error {
        // Handle error.
        return
    }
    if let credential = credential {
        Auth.auth().signIn(with: credential) { authResult, error in
            if let error = error {
                // Handle error.
                 return
            }
            // User is signed in.
        }
    }
}
```

## Sign In with Apple


```swift
let provider = OAuthProvider(providerID: "apple.com")
// Default scopes: name and email.
provider.scopes = ["email", "name"]
// "en" is the default locale.
provider.customParameters = [
    "locale": "en"
]

provider.getCredentialWith(nil) { credential, error in
    if let error = error {
        // Handle error.
        return
    }
    if let credential = credential {
        Auth.auth().signIn(with: credential) { authResult, error in
            if let error = error {
                // Handle error.
                 return
            }
            // User is signed in.
        }
    }
}
```

## Sign In with Twitter


```swift
let provider = OAuthProvider(providerID: "twitter.com")

provider.getCredentialWith(nil) { credential, error in
    if let error = error {
        // Handle error.
        return
    }
    if let credential = credential {
        Auth.auth().signIn(with: credential) { authResult, error in
            if let error = error {
                // Handle error.
                 return
            }
            // User is signed in.
        }
    }
}
```

## Sign In with GitHub


```swift
let provider = OAuthProvider(providerID: "github.com")

provider.getCredentialWith(nil) { credential, error in
    if let error = error {
        // Handle error.
        return
    }
    if let credential = credential {
        Auth.auth().signIn(with: credential) { authResult, error in
            if let error = error {
                // Handle error.
                 return
            }
            // User is signed in.
        }
    }
}
```

## Sign In with Microsoft


```swift
let provider = OAuthProvider(providerID: "microsoft.com")

provider.getCredentialWith(nil) { credential, error in
    if let error = error {
        // Handle error.
        return
    }
    if let credential = credential {
        Auth.auth().signIn(with: credential) { authResult, error in
            if let error = error {
                // Handle error.
                 return
            }
            // User is signed in.
        }
    }
}
```

## Sign In with Yahoo


```swift
let provider = OAuthProvider(providerID: "yahoo.com")

provider.getCredentialWith(nil) { credential, error in
    if let error = error {
        // Handle error.
        return
    }
    if let credential = credential {
        Auth.auth().signIn(with: credential) { authResult, error in
            if let error = error {
                // Handle error.
                 return
            }
            // User is signed in.
        }
    }
}
```

## Sign In Anonymously


```swift
Auth.auth().signInAnonymously { authResult, error in
  if let error = error {
     print("Error: \(error.localizedDescription)")
     return
  }
  // User is signed in anonymously
  let user = authResult?.user
  let isAnonymous = user?.isAnonymous  // true
}
```

## Phone Authentication


```swift
// 1. Verify Phone Number
PhoneAuthProvider.provider()
  .verifyPhoneNumber(phoneNumber, uiDelegate: nil) { verificationID, error in
      if let error = error {
        print("Error: \(error.localizedDescription)")
        return
      }
      // Sign in using the verificationID and the code sent to the user
      UserDefaults.standard.set(verificationID, forKey: "authVerificationID")
  }

// 2. Sign In with Code
let verificationID = UserDefaults.standard.string(forKey: "authVerificationID")
let credential = PhoneAuthProvider.provider().credential(
  withVerificationID: verificationID,
  verificationCode: "123456"
)

Auth.auth().signIn(with: credential) { authResult, error in
  if let error = error {
    print("Error: \(error.localizedDescription)")
    return
  }
  // User is signed in
}
```

## Email Link Authentication


```swift
// 1. Send Link
let actionCodeSettings = ActionCodeSettings()
actionCodeSettings.url = URL(string: "https://www.example.com/finishSignUp?cartId=1234")
actionCodeSettings.handleCodeInApp = true
actionCodeSettings.setAndroidPackageName("com.example.android", installIfNotAvailable: false, minimumVersion: "12")

Auth.auth().sendSignInLink(toEmail: email, actionCodeSettings: actionCodeSettings) { error in
  if let error = error {
    print("Error: \(error.localizedDescription)")
    return
  }
  // The link was successfully sent.
}

// 2. Complete Sign-in (in handling link)
let link = "https://www.example.com/finishSignUp?..." // Retrieve from Universal Link
if Auth.auth().isSignIn(withEmailLink: link) {
    Auth.auth().signIn(withEmail: "user@example.com", link: link) { authResult, error in
       if let error = error {
         print("Error: \(error.localizedDescription)")
         return
       }
       // User is signed in
    }
}
```

## Observe Auth State


```swift
var handle: AuthStateDidChangeListenerHandle?

override func viewWillAppear(_ animated: Bool) {
    handle = Auth.auth().addStateDidChangeListener { auth, user in
      // ...
      if let user = user {
          // User is signed in.
          print("User is signed in: \(user.email ?? "Anonymous")")
      } else {
          // User is signed out.
          print("User is signed out")
      }
    }
}

override func viewWillDisappear(_ animated: Bool) {
    Auth.auth().removeStateDidChangeListener(handle!)
}
```

## Sign Out


```swift
let firebaseAuth = Auth.auth()
do {
  try firebaseAuth.signOut()
} catch let signOutError as NSError {
  print("Error signing out: %@", signOutError)
}
```
