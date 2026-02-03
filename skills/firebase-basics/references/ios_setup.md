# Firebase iOS Setup Guide

## 1. Create a Firebase Project
If you haven't already created a project:

```bash
firebase projects:create
```

## 2. Register Your App
Register your iOS app with Firebase. You'll need your Bundle ID (found in Xcode > General tab).

```bash
firebase apps:create ios com.example.myapp
```

This command returns an **App ID** (e.g., `1:1234567890:ios:xxxxxxxx`). Note this ID.

## 3. Add Config File
Download the configuration file using your App ID:

```bash
firebase apps:sdkconfig <APP_ID> --out GoogleService-Info.plist
```

Move this file to the root of your Xcode project and add it to all targets.

## 4. Add Firebase SDKs
Use Swift Package Manager (SPM):
1.  Xcode > File > Add Packages.
2.  Enter URL: `https://github.com/firebase/firebase-ios-sdk`.
3.  Choose the libraries you need (e.g., `FirebaseFirestore`, `FirebaseAuth`).

## 5. Initialize Firebase
In your `AppDelegate` or `App` struct:

**SwiftUI:**
```swift
import SwiftUI
import FirebaseCore

@main
struct YourApp: App {
  init() {
    FirebaseApp.configure()
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}
```

**UIKit (AppDelegate):**
```swift
import UIKit
import FirebaseCore

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    FirebaseApp.configure()
    return true
  }
}
```
