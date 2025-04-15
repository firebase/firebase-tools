## NEXT

- [Fixed] Fragments now properly validate for execution

## 1.1.0

- Updated internal `firebase-tools` dependency to 14.1.0
- [Fixed] User auth will now load without requiring extension sidebar to open

## 1.0.0

- [Breaking] Updated minimum VSCode version requirement to 1.69.0 to ensure node 20 is used
- Updated internal `firebase-tools` dependency to 14.0.0
- [Added] Added rerun execution button in variables context
- [Added] Provide default required variables during execution
- [Fixed] Fixed an issue where environment variables provided in `extraEnv` were not respected in some cases

## 0.14.2

- Updated internal `firebase-tools` dependency to 13.34.0

## 0.14.1

- Updated internal `firebase-tools` dependency to 13.33.0
- Updated introspection endpoint to V1
- Allow unused variables in GraphQL queries and mutations.

## 0.14.0

- Updated internal `firebase-tools` dependency to 13.32.0
- [Fixed] Graphql Language Server support for Windows

## 0.13.1

- Updated internal `firebase-tools` dependency to 13.31.2

## 0.13.0

- Updated internal `firebase-tools` dependency to 13.30.0
- [Added] Added `extraEnv` setting to help extension development.
- [Added] Make Run Local button always present

## 0.12.2

- Updated internal `firebase-tools` dependency to 13.29.3
- [Fixed] Fixed a bug where results panel would break on API error

## 0.12.1

- Updated internal `firebase-tools` dependency to 13.29.2
- [Added] Added support for emulator import/export.
- [Added] Added `debug` setting to run commands with `--debug`
- [Fixed] Fixed a bug where emulator issues weren't being surfaced

## 0.12.0

- Updated internal firebase-tools dependency to 13.29.1
- [Fixed] Fixed firebase binary detection for analytics

## 0.11.1

- [Fixed] Fixed IDX analytics issue

## 0.11.0

- Updated internal firebase-tools dependency to 13.28.0
- [Fixed] Fixed an issue where generating an ad-hoc file would break codelenses

## 0.10.8

- Updated internal firebase-tools dependency to 13.25.0
- [Fixed] Fixed an issue where the toolkit wouldn't start with misconfigured configs
- [Fixed] Fixed a visual bug when selecting a Firebase project in an empty folder

## 0.10.7

- Updated internal firebase-tools dependency to 13.24.2
- [Fixed] Fixed an issue where Add data and Read data would generate operations in the wrong folder
- [Fixed] Fixed an issue where firebase version check produced false positives on Windows (#7910)

## 0.10.6

- Updated internal firebase-tools dependency to 13.23.1
- [Added] Persist FIREBASE_BINARY env variable to settings.
- [Fixed] Fixed an issue where .firebaserc was being overwritten by the extension (#7861)

## 0.10.5

- [Fixed] Fixed an issue where multiple instances of the extension would break the toolkit.

## 0.10.4

- [Fixed] Fixed an issue where log files would be written to non-Firebase directories.

## 0.10.3

- Updated internal firebase-tools dependency to 13.21.0
- Updated default debug-log output to .firebase/logs directory
- [Fixed] Fixed an issue where emulator startup would hang
- Updated text for SDK configuration button

## 0.10.2

- Updated internal firebase-tools dependency to 13.20.2

## 0.10.1

- [Fixed] Fixed an issue where commands would be executed against directory default project instead of the currently selected project.
- [Fixed] Fixed an issue where expired auth tokens would be used.
- [Fixed] Fixed an issue where Add Data wouldn't generate UUID types
- Updated README with feature descriptions

## 0.10.0

- [Added] UI overhaul.
- [Added] Added View Docs button to see generated documentation for your schema and connectors.
- [Fixed] Improved detection for emulator start up and shut down.
- [Fixed] Improved error handling for variables pane.
- [Added] Added Firebase path setting, to control which Firebase dbinary is used when executing commands.

## 0.9.1

- Updated internal firebase-tools dependency to 13.19.0

## 0.9.0

- Updated internal firebase-tools dependency to 13.18.0

## 0.8.0

- Updated internal firebase-tools dependency to 13.17.0

- [Fixed] Extension properly picks up firebase.json changes during Firebase Init flow

## 0.7.0

- Updated internal firebase-tools dependency to 13.16.0

## 0.6.2

- Updated internal firebase-tools dependency to 13.15.4

## 0.6.1

- Updated internal firebase-tools dependency to 13.15.3

## 0.6.0

- Updated internal firebase-tools dependency to 13.15.2

- [Added] Support for configuring generated SDK
- Automatically pick up IDX project selection.

## 0.5.4

- Updated internal firebase-tools dependency to 13.15.1

## 0.5.3

- Updated internal firebase-tools dependency to 13.15.0

## 0.5.2

- Updated internal firebase-tools dependency to 13.14.2

## 0.5.1

- Updated internal firebase-tools dependency to 13.14.1

## 0.5.0

- Updated internal firebase-tools dependency to 13.14.0

## 0.4.4

- [Fixed] Local execution now properly supports Vertex API

## 0.4.3

- Updated internal firebase-tools dependency to 13.13.3

## 0.4.2

- Updated internal firebase-tools dependency to 13.13.2

## 0.4.1

- Updated internal firebase-tools dependency to 13.13.1

- IDX Auth is picked up by VSCode
- [Fixed] Data Connect emulator issues properly streamed on startup
- [Fixed] Data Connect schema reloads consistently

## 0.4.0

- Updated internal firebase-tools dependency to 13.13.0

## 0.3.0

- Updated internal firebase-tools dependency to 13.12.0

## 0.2.9

- Updated internal firebase-tools dependency to 13.11.4

- Support CLI started emulators

## 0.2.8

- Updated internal firebase-tools dependency to 13.11.3

## 0.2.7

- Updated internal firebase-tools dependency to 13.11.2

## 0.2.6

- Updated internal firebase-tools dependency to 13.11.1

- Fix behaviour on failed postgres connection

## 0.2.5

- Icon fix

## 0.2.4

- Emulator bump v1.2.0
- Connect to postgres flow reworked
- Telemetry enabled

## 0.2.3

- Emulator bump v1.1.19

## 0.2.2

- Emulator bump v1.1.18

## 0.2.1

- Update Logo
- Improve init flow for users with existing firebase.json

## 0.2.0

- Fix Auth on IDX

## 0.1.9

- Fix "Add Data" for nonnull and custom keys
- Emulator Bump 1.1.17

## 0.1.8

- Update Extensions page Logo
- Update README for Extensions page
- Surface emulator issues as notifications
- Generate .graphqlrc automatically
- Emulator Bump 1.1.16

## 0.1.7

- Emulator Bump 1.1.14

## 0.1.6

- Fix deploy command

## 0.1.5

- Fix authentication issues for Introspection and local executions

## 0.1.4

- Dataconnect Sidebar UI refresh
  - Emulator and Production sections
  - Separate Deploy All and Deploy individual buttons
  - Links to external documentation

## 0.1.0

- Data Connect Support

## 0.0.25 (unreleased)

- Replace predeploy hack with something more robust.

## 0.0.24

- Remove proxy-agent stub #6172
- Pull in latest CLI changes (July 25, 2023)

## 0.0.24-alpha.1

- Add more user-friendly API permission denied messages

## 0.0.24-alpha.0

- Remove Google sign-in option from Monospace.
- Fix some Google sign-in login/logout logic.
- Prioritize showing latest failed deploy if it failed.

## 0.0.23 (July 13, 2023)

- Same as alpha.5, marked as stable.

## 0.0.23-alpha.5 (July 12, 2023)

- More fixes for service account detection logic.
- Better output and error handling for init and deploy steps.

## 0.0.23-alpha.4 (July 11, 2023)

- Fix for service account bugs

## 0.0.23-alpha.3 (July 7, 2023)

- UX updates
  - Get last deploy date
  - Write to and show info level logs in output channel when deploying
  - Enable user to view service account email

## 0.0.23-alpha.2 (July 6 2023)

- Service account internal fixes plus fix for deploying Next.js twice in a row
