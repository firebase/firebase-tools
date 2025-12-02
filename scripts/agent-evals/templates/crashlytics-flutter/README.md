# Crashlytics Flutter Example

This is a simple Flutter application created to demonstrate the integration of Firebase Crashlytics.

## Features

- A simple counter that increments on button click.
- Intentionally crashes when the counter is a multiple of 5 to test Crashlytics reporting.

## How to Use

1.  Run `flutter pub get` to install dependencies.
2.  Configure Firebase for both Android and iOS using the FlutterFire CLI.
3.  Build and run the application on a device or emulator.
4.  Click the "Increment" button 5 times to trigger a crash.
5.  Check the Firebase Crashlytics dashboard to see the crash report.
