# Firebase Authentication Android SDK

## Initialization

First, ensure you have [added Firebase to your Android project](https://firebase.google.com/docs/android/setup).


```kotlin
// Import the BoM for the Firebase platform
implementation(platform("com.google.firebase:firebase-bom:33.7.0"))

// Add the dependency for the Firebase Authentication library
implementation("com.google.firebase:firebase-auth")
```

In your activity:
```kotlin
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.ktx.auth
import com.google.firebase.ktx.Firebase

private lateinit var auth: FirebaseAuth

override fun onCreate(savedInstanceState: Bundle?) {
    // ...
    // Initialize Firebase Auth
    auth = Firebase.auth
}
```

## Connect to Emulator
If you are running the Authentication emulator locally.


```kotlin
// 10.0.2.2 is the special IP for localhost from the Android emulator
val auth = Firebase.auth
auth.useEmulator("10.0.2.2", 9099)
```

## Sign Up with Email/Password


```kotlin
auth.createUserWithEmailAndPassword(email, password)
    .addOnCompleteListener(this) { task ->
        if (task.isSuccessful) {
            // Sign in success, update UI with the signed-in user's information
            Log.d(TAG, "createUserWithEmail:success")
            val user = auth.currentUser
            updateUI(user)
        } else {
            // If sign in fails, display a message to the user.
            Log.w(TAG, "createUserWithEmail:failure", task.exception)
            Toast.makeText(baseContext, "Authentication failed.",
                Toast.LENGTH_SHORT).show()
            updateUI(null)
        }
    }
```

## Sign In with Email/Password


```kotlin
auth.signInWithEmailAndPassword(email, password)
    .addOnCompleteListener(this) { task ->
        if (task.isSuccessful) {
            // Sign in success, update UI with the signed-in user's information
            Log.d(TAG, "signInWithEmail:success")
            val user = auth.currentUser
            updateUI(user)
        } else {
            // If sign in fails, display a message to the user.
            Log.w(TAG, "signInWithEmail:failure", task.exception)
            Toast.makeText(baseContext, "Authentication failed.",
                Toast.LENGTH_SHORT).show()
            updateUI(null)
        }
    }
```

## Sign In with Google
Requires `play-services-auth` dependency.


```kotlin
// Configure Google Sign In
val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
    .requestIdToken(getString(R.string.default_web_client_id))
    .requestEmail()
    .build()

val googleSignInClient = GoogleSignIn.getClient(this, gso)

// Start the sign in flow
val signInIntent = googleSignInClient.signInIntent
startActivityForResult(signInIntent, RC_SIGN_IN)

// ... handle result ...
private fun firebaseAuthWithGoogle(idToken: String) {
    val credential = GoogleAuthProvider.getCredential(idToken, null)
    auth.signInWithCredential(credential)
        .addOnCompleteListener(this) { task ->
            if (task.isSuccessful) {
                // Sign in success, update UI with the signed-in user's information
                val user = auth.currentUser
                updateUI(user)
            } else {
                // If sign in fails, display a message to the user.
                updateUI(null)
            }
        }
}
```

## Sign In with Facebook


```kotlin
val provider = OAuthProvider.newBuilder("facebook.com")
// Target specific email with login hint.
provider.addCustomParameter("display", "popup")

auth.startActivityForSignInWithProvider(this, provider.build())
    .addOnSuccessListener {
        // User is signed in.
        // IdP data available in
        // it.additionalUserInfo.profile
         val user = it.user
         val credential = it.credential
    }
    .addOnFailureListener {
        // Handle failure.
    }
```

## Sign In with Apple


```kotlin
val provider = OAuthProvider.newBuilder("apple.com")
provider.scopes = listOf("email", "name")
provider.addCustomParameter("locale", "en")

auth.startActivityForSignInWithProvider(this, provider.build())
    .addOnSuccessListener {
         val user = it.user
    }
    .addOnFailureListener {
        // Handle failure.
    }
```

## Sign In with Twitter


```kotlin
val provider = OAuthProvider.newBuilder("twitter.com")

auth.startActivityForSignInWithProvider(this, provider.build())
    .addOnSuccessListener {
         val user = it.user
         val credential = it.credential
    }
    .addOnFailureListener {
        // Handle failure.
    }
```

## Sign In with GitHub


```kotlin
val provider = OAuthProvider.newBuilder("github.com")

auth.startActivityForSignInWithProvider(this, provider.build())
    .addOnSuccessListener {
         val user = it.user
         val credential = it.credential
    }
    .addOnFailureListener {
        // Handle failure.
    }
```

## Sign In with Microsoft


```kotlin
val provider = OAuthProvider.newBuilder("microsoft.com")

auth.startActivityForSignInWithProvider(this, provider.build())
    .addOnSuccessListener {
         val user = it.user
    }
    .addOnFailureListener {
        // Handle failure.
    }
```

## Sign In with Yahoo


```kotlin
val provider = OAuthProvider.newBuilder("yahoo.com")

auth.startActivityForSignInWithProvider(this, provider.build())
    .addOnSuccessListener {
         val user = it.user
    }
    .addOnFailureListener {
        // Handle failure.
    }
```

## Sign In Anonymously


```kotlin
auth.signInAnonymously()
    .addOnCompleteListener(this) { task ->
        if (task.isSuccessful) {
            // Sign in success, update UI with the signed-in user's information
            Log.d(TAG, "signInAnonymously:success")
            val user = auth.currentUser
            updateUI(user)
        } else {
            // If sign in fails, display a message to the user.
            Log.w(TAG, "signInAnonymously:failure", task.exception)
            Toast.makeText(baseContext, "Authentication failed.",
                Toast.LENGTH_SHORT).show()
            updateUI(null)
        }
    }
```

## Phone Authentication


```kotlin
val options = PhoneAuthOptions.newBuilder(auth)
    .setPhoneNumber(phoneNumber)       // Phone number to verify
    .setTimeout(60L, TimeUnit.SECONDS) // Timeout and unit
    .setActivity(this)                 // Activity (for callback binding)
    .setCallbacks(callbacks)           // OnVerificationStateChangedCallbacks
    .build()
PhoneAuthProvider.verifyPhoneNumber(options)

// Callbacks
val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
    override fun onVerificationCompleted(credential: PhoneAuthCredential) {
        // This callback will be invoked in two situations:
        // 1 - Instant verification. In some cases the phone number can be instantly
        //     verified without needing to send or enter a verification code.
        // 2 - Auto-retrieval. On some devices Google Play services can automatically
        //     detect the incoming verification SMS and perform verification without
        //     user action.
        signInWithPhoneAuthCredential(credential)
    }

    override fun onVerificationFailed(e: FirebaseException) {
        // This callback is invoked in an invalid request for verification, such as an
        // invalid phone number format.
    }

    override fun onCodeSent(
        verificationId: String,
        token: PhoneAuthProvider.ForceResendingToken
    ) {
        // The SMS verification code has been sent to the provided phone number, we
        // now need to ask the user to enter the code and then construct a credential
        // by combining the code with a verification ID.
        // Save verificationId and forceResendingToken for later use.
    }
}
```

## Email Link Authentication


```kotlin
// 1. Send Link
val actionCodeSettings = ActionCodeSettings.newBuilder()
    .setUrl("https://www.example.com/finishSignUp?cartId=1234")
    // This must be true
    .setHandleCodeInApp(true)
    .setAndroidPackageName(
        "com.example.android",
        true, /* installIfNotAvailable */
        "12"    /* minimumVersion */)
    .build()

Firebase.auth.sendSignInLinkToEmail(email, actionCodeSettings)
    .addOnCompleteListener { task ->
        if (task.isSuccessful) {
            Log.d(TAG, "Email sent.")
        }
    }

// 2. Complete Sign-in (in handling activity)
if (isSignInWithEmailLink(intent)) {
    // Retrieve this from wherever you stored it
    val email = "user@example.com"
    
    auth.signInWithEmailLink(email, link)
        .addOnCompleteListener { task ->
            if (task.isSuccessful) {
                Log.d(TAG, "Successfully signed in with email link!")
                val result = task.result
                // You can access the new user via result.user
            } else {
                Log.e(TAG, "Error signing in with email link", task.exception)
            }
        }
}
```

## Observe Auth State


```kotlin
public override fun onStart() {
    super.onStart()
    // Check if user is signed in (non-null) and update UI accordingly.
    val currentUser = auth.currentUser
    if(currentUser != null){
        updateUI(currentUser)

    }
}
```

## Sign Out


```kotlin
Firebase.auth.signOut()
```
