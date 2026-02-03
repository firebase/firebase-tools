# Firebase Android Setup Guide

## 1. Create a Firebase Project
If you haven't already created a project:

```bash
firebase projects:create
```

## 2. Register Your App
Register your Android app with Firebase. You'll need your package name (found in `app/build.gradle`).

```bash
firebase apps:create android com.example.myapp
```

This command returns an **App ID** (e.g., `1:1234567890:android:xxxxxxxx`). Note this ID.

## 3. Add Config File
Download the configuration file using your App ID:

```bash
firebase apps:sdkconfig <APP_ID> --out app/google-services.json
```

## 4. Add Firebase SDKs
Using Gradle (Kotlin DSL recommended):

**Root-level `build.gradle.kts`:**
```kotlin
plugins {
  id("com.android.application") version "8.x" apply false
  id("com.google.gms.google-services") version "4.4.4" apply false
}
```

**App-level `app/build.gradle.kts`:**
```kotlin
plugins {
  id("com.android.application")
  id("com.google.gms.google-services")
}

dependencies {
  // Import the BoM for the Firebase platform
  // Use https://firebase.google.com/support/release-notes/android to look up the latest version
  implementation(platform("com.google.firebase:firebase-bom:34.8.0"))

  // Add the dependency for the Firebase products you want to use
  // When using the BoM, don't specify versions in Firebase dependencies
  implementation("com.google.firebase:firebase-firestore")
  implementation("com.google.firebase:firebase-auth")
}
```

## 5. Sync Project
Click **Sync Now** in Android Studio to download dependencies.
