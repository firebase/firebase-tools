# Crashlytics iOS Example

This is a simple iOS application created to demonstrate the integration of Firebase Crashlytics.

## Features

- A simple counter that increments on button click.
- Intentionally crashes when the counter is a multiple of 5 to test Crashlytics reporting.

## How to Use

1.  Run `pod install` to install dependencies.
2.  Open `IOSExampleApp.xcworkspace` in Xcode.
3.  Add your `GoogleService-Info.plist` to the project.
4.  Build and run the application on a device or simulator.
5.  Click the "Increment" button 5 times to trigger a crash.
6.  Check the Firebase Crashlytics dashboard to see the crash report.
