# Firebase Flutter Setup Guide

## 1. Prerequisites
- Install [Firebase CLI](https://firebase.google.com/docs/cli).
- Install [Flutter SDK](https://flutter.dev/docs/get-started/install).

## 2. Install FlutterFire CLI
Install the CLI tool:

```bash
dart pub global activate flutterfire_cli
```

## 3. Configure Project
From your Flutter project root, run:

```bash
flutterfire configure
```
This command is the primary way to connect your Flutter app to Firebase. It:
1.  Creates a new Firebase project (if selected) or connects to an existing one.
2.  Creates platform-specific apps (iOS, Android, Web, macOS) in the Firebase project.
3.  Automatically generates `lib/firebase_options.dart`.

**Note:** You do **not** need to manually create apps via `firebase apps:create` when using `flutterfire`.

## 4. Initialize Firebase
1.  Add the core dependency:
    ```bash
    flutter pub add firebase_core
    ```

2.  Update `lib/main.dart`:
    ```dart
    import 'package:flutter/material.dart';
    import 'package:firebase_core/firebase_core.dart';
    import 'firebase_options.dart';

    void main() async {
      WidgetsFlutterBinding.ensureInitialized();
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
      runApp(const MyApp());
    }
    ```

## 5. Add Plugins
Add dependencies for specific products:

```bash
flutter pub add firebase_auth
flutter pub add cloud_firestore
```

**Note:** Always run `flutterfire configure` again after adding new plugins or platforms to ensure configuration files remain up-to-date.
