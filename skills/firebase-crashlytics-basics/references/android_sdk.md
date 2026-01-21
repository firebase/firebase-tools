# Adding Firebase Crashlytics to an Android App

This document provides a comprehensive guide for adding the Firebase Crashlytics SDK to an Android application, based on the latest official Firebase documentation.

## Step 1: Update your Gradle configuration

> **Note:** The following instructions are for projects using Gradle 8.0 or higher. If you are using an older version of Gradle, please refer to the official Firebase documentation for the appropriate setup.

### Project-level `settings.gradle.kts` (or `settings.gradle`)

In your project's root `settings.gradle.kts` or `settings.gradle` file, add the following to the `pluginManagement` block:

**Kotlin (`settings.gradle.kts`):**

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        id("com.android.application") version "8.4.1" apply false
        id("com.google.gms.google-services") version "4.4.2" apply false
        id("com.google.firebase.crashlytics") version "3.0.1" apply false
    }
}
```

**Groovy (`settings.gradle`):**

```groovy
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        id 'com.android.application' version '8.4.1' apply false
        id 'com.google.gms.google-services' version '4.4.2' apply false
        id 'com.google.firebase.crashlytics' version '3.0.1' apply false
    }
}
```

### App-level `build.gradle.kts` (or `build.gradle`)

In your app's `build.gradle.kts` or `build.gradle` file (usually located at `app/build.gradle`), apply the Crashlytics plugin and add the SDK dependencies.

**Kotlin (`build.gradle.kts`):**

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.google.gms.google.services)
    alias(libs.plugins.google.firebase.crashlytics)
}

dependencies {
    // Import the Firebase BoM
    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))

    // Add the dependency for the Firebase Crashlytics library
    // When using the BoM, you don't specify versions in Firebase library dependencies
    implementation("com.google.firebase:firebase-crashlytics-ktx")

    // To get breadcrumb logs for crash reports, it's recommended to also add the Firebase Analytics dependency
    implementation("com.google.firebase:firebase-analytics-ktx")

    // For apps with native code, it's recommended to also add the Crashlytics NDK dependency
    implementation("com.google.firebase:firebase-crashlytics-ndk")
}

// If your app uses native code, configure the Crashlytics extension to upload native symbols.
firebaseCrashlytics {
    // Enable processing and uploading of native symbols to Crashlytics.
    // This flag is disabled by default because it requires you to have the Android NDK installed.
    nativeSymbolUploadEnabled.set(true)

    // Enable uploading of ProGuard/R8 mapping files
    // This is required for de-obfuscating stack traces if your app is minified.
    mappingFileUploadEnabled.set(true)
}
```

**Groovy (`build.gradle`):**

```groovy
plugins {
    id 'com.android.application'
    id 'com.google.gms.google-services'
    id 'com.google.firebase.crashlytics'
}

dependencies {
    // Import the Firebase BoM
    implementation platform('com.google.firebase:firebase-bom:33.1.2')

    // Add the dependency for the Firebase Crashlytics library
    // When using the BoM, you don't specify versions in Firebase library dependencies
    implementation 'com.google.firebase:firebase-crashlytics-ktx'

    // To get breadcrumb logs for crash reports, it's recommended to also add the Firebase Analytics dependency
    implementation 'com.google.firebase:firebase-analytics-ktx'

    // For apps with native code, it's recommended to also add the Crashlytics NDK dependency
    implementation 'com.google.firebase:firebase-crashlytics-ndk'
}

// If your app uses native code, configure the Crashlytics extension to upload native symbols.
firebaseCrashlytics {
    // Enable processing and uploading of native symbols to Crashlytics.
    // This flag is disabled by default because it requires you to have the Android NDK installed.
    nativeSymbolUploadEnabled true
    
    // Enable uploading of ProGuard/R8 mapping files
    // This is required for de-obfuscating stack traces if your app is minified.
    mappingFileUploadEnabled true
}
```

## Step 1.1: Troubleshooting Native Symbols

If you are using NDK and dont see symbolicated stack traces:

1.  Ensure you have the **Android NDK** installed in Android Studio (SDK Manager > SDK Tools > NDK (Side by side)).
2.  Ensure `unstrippedNativeLibsDir` is pointing to the correct location if you are using a custom build system.
3.  Force a refresh of dependencies: `./gradlew clean app:assembleDebug --refresh-dependencies`.

## Step 1.2: Understanding ANRs

Crashlytics automatically captures ANR (Application Not Responding) events on Android 11+ devices.
*   **Requirement:** The app must be installed from the Google Play Store (or recognized by Play Services) for ANRs to be reported in many cases, though strictly local debugging often catches them too.
*   **No Extra Code:** You generally do not need extra code to enable ANR reporting with the latest SDKs.
```

> **Note:** For the BoM and plugin versions, please refer to the official Firebase documentation for the latest versions.

## Step 2: Implement User Consent (Optional but Recommended)

It is a best practice to allow users to opt-out of crash reporting. You can control data collection by enabling or disabling it programmatically.

In your `Application` class or main activity, you can add the following code:

```java
import com.google.firebase.crashlytics.FirebaseCrashlytics;

// ...

// Check for user's preference and enable/disable collection accordingly
FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(userHasOptedIn);
```

You can also do this in your `AndroidManifest.xml` by adding `<meta-data android:name="firebase_crashlytics_collection_enabled" android:value="false" />` inside the `<application>` tag. The programmatic approach is more flexible as it allows you to change the setting at runtime.

## Step 3: Using Crashlytics

Once initialized, Crashlytics will automatically report crashes. You can also use it to log custom events and non-fatal exceptions.

### Log Custom Messages

```java
FirebaseCrashlytics.getInstance().log("User performed a custom action");
```

### Record Non-Fatal Exceptions

```java
try {
    // ...
} catch (Exception e) {
    FirebaseCrashlytics.getInstance().recordException(e);
}
```

### Set User Identifiers

```java
FirebaseCrashlytics.getInstance().setUserId("user123");
```

### Set Custom Keys

```java
FirebaseCrashlytics.getInstance().setCustomKey("level", "5");
FirebaseCrashlytics.getInstance().setCustomKey("score", "10000");
```

## Step 4: Final Steps

1.  Sync your project with the Gradle files.
2.  Run your app to verify the implementation.
3.  To test your implementation, you can force a test crash:
    ```java
    throw new RuntimeException("Test Crash"); // Force a crash
    ```
4.  After the app crashes, run it again so the Crashlytics SDK can upload the report.
5.  Check the Firebase Crashlytics dashboard to see the crash report.
