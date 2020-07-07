# Firebase CLI [![Actions Status][gh-actions-badge]][gh-actions] [![Node Version][node-badge]][npm] [![NPM version][npm-badge]][npm]

The Firebase Command Line Interface (CLI) Tools can be used to test, manage, and deploy your Firebase project from the command line.

- Deploy code and assets to your Firebase projects
- Run a local web server for your Firebase Hosting site
- Interact with data in your Firebase database
- Import/Export users into/from Firebase Auth

To get started with the Firebase CLI, read the full list of commands below or check out the [documentation](https://firebase.google.com/docs/cli).

## Installation

### Node Package

You can install the Firebase CLI using npm (the Node Package Manager). Note that you will need to install
[Node.js](http://nodejs.org/) and [npm](https://npmjs.org/). Installing Node.js should install npm as well.

To download and install the Firebase CLI run the following command:

```bash
npm install -g firebase-tools
```

This will provide you with the globally accessible `firebase` command.

### Standalone Binary

The standalone binary distribution of the Firebase CLI allows you to download a `firebase` executable
without any dependencies.

To download and install the CLI run the following command:

```bash
curl -sL firebase.tools | bash
```

## Commands

**The command `firebase --help` lists the available commands and `firebase <command> --help` shows more details for an individual command.**

If a command is project-specific, you must either be inside a project directory with an
active project alias or specify the Firebase project id with the `-P <project_id>` flag.

Below is a brief list of the available commands and their function:

### Configuration Commands

| Command      | Description                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **login**    | Authenticate to your Firebase account. Requires access to a web browser.                                                                        |
| **logout**   | Sign out of the Firebase CLI.                                                                                                                   |
| **login:ci** | Generate an authentication token for use in non-interactive environments.                                                                       |
| **use**      | Set active Firebase project, manage project aliases.                                                                                            |
| **open**     | Quickly open a browser to relevant project resources.                                                                                           |
| **init**     | Setup a new Firebase project in the current directory. This command will create a `firebase.json` configuration file in your current directory. |
| **help**     | Display help information about the CLI or specific commands.                                                                                    |

Append `--no-localhost` to login (i.e., `firebase login --no-localhost`) to copy and paste code instead of starting a local server for authentication. A use case might be if you SSH into an instance somewhere and you need to authenticate to Firebase on that machine.

### Project Management Commands

| Command                  | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| **apps:create**          | Create a new Firebase app in a project.                    |
| **apps:list**            | List the registered apps of a Firebase project.            |
| **apps:sdkconfig**       | Print the configuration of a Firebase app.                 |
| **projects:addfirebase** | Add Firebase resources to a Google Cloud Platform project. |
| **projects:create**      | Create a new Firebase project.                             |
| **projects:list**        | Print a list of all of your Firebase projects.             |

### Deployment and Local Emulation

These commands let you deploy and interact with your Firebase services.

| Command                       | Description                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **emulators:exec**            | Start the local Firebase emulators, run a test script, then shut down the emulators.                                          |
| **emulators:start**           | Start the local Firebase emulators.                                                                                           |
| **deploy**                    | Deploys your Firebase project. Relies on `firebase.json` configuration and your local project folder.                         |
| **serve**                     | Start a local server with your Firebase Hosting configuration and HTTPS-triggered Cloud Functions. Relies on `firebase.json`. |
| **setup:emulators:database**  | Downloads the database emulator.                                                                                              |
| **setup:emulators:firestore** | Downloads the firestore emulator.                                                                                             |

### App Distribution Commands

| Command                        | Description            |
| ------------------------------ | ---------------------- |
| **appdistribution:distribute** | Upload a distribution. |

### Auth Commands

| Command         | Description                                            |
| --------------- | ------------------------------------------------------ |
| **auth:import** | Batch importing accounts into Firebase from data file. |
| **auth:export** | Batch exporting accounts from Firebase into data file. |

Detailed doc is [here](https://firebase.google.com/docs/cli/auth).

### Realtime Database Commands

| Command                       | Description                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **database:get**              | Fetch data from the current project's database and display it as JSON. Supports querying on indexed data.                                   |
| **database:set**              | Replace all data at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.         |
| **database:push**             | Push new data to a list at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.  |
| **database:remove**           | Delete all data at a specified location in the current project's database.                                                                  |
| **database:update**           | Perform a partial update at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument. |
| **database:profile**          | Profile database usage and generate a report.                                                                                               |
| **database:instances:create** | Create a realtime database instance.                                                                                                        |
| **database:instances:list**   | List realtime database instances.                                                                                                           |
| **database:settings:get**     | Read the realtime database setting at path                                                                                                  |
| **database:settings:set**     | Set the realtime database setting at path.                                                                                                  |

### Extensions Commands

| Command           | Description                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------- |
| **ext**           | Display information on how to use ext commands and extensions installed to your project.    |
| **ext:configure** | Configure an existing extension instance.                                                   |
| **ext:info**      | Display information about an extension by name (extensionName@x.y.z for a specific version) |
| **ext:install**   | Install an extension.                                                                       |
| **ext:list**      | List all the extensions that are installed in your Firebase project.                        |
| **ext:uninstall** | Uninstall an extension that is installed in your Firebase project by Instance ID.           |
| **ext:update**    | Update an existing extension instance to the latest version.                                |

### Cloud Firestore Commands

| Command               | Description                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **firestore:delete**  | Delete documents or collections from the current project's database. Supports recursive deletion of subcollections. |
| **firestore:indexes** | List all deployed indexes from the current project.                                                                 |

### Cloud Functions Commands

| Command                    | Description                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **functions:log**          | Read logs from deployed Cloud Functions.                                                                     |
| **functions:config:set**   | Store runtime configuration values for the current project's Cloud Functions.                                |
| **functions:config:get**   | Retrieve existing configuration values for the current project's Cloud Functions.                            |
| **functions:config:unset** | Remove values from the current project's runtime configuration.                                              |
| **functions:config:clone** | Copy runtime configuration from one project environment to another.                                          |
| **functions:delete**       | Delete one or more Cloud Functions by name or group name.                                                    |
| **functions:shell**        | Locally emulate functions and start Node.js shell where these local functions can be invoked with test data. |

### Hosting Commands

| Command             | Description                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **hosting:disable** | Stop serving Firebase Hosting traffic for the active project. A "Site Not Found" message will be displayed at your project's Hosting URL after running this command. |

## Authentication

### General

The Firebase CLI can use one of three authentication methods listed in descending priority:

- `GOOGLE_APPLICATION_CREDENTIALS` - if this environment variable points to a service account key file, the Firebase CLI will authenticate as a service account.
- `firebase login` - you can log in to the CLI directly as yourself. The CLI will store an authorized user credential.
  - `FIREBASE_TOKEN` - you can explicitly use this environment variable to pass in a long-lived user token from `firebase login:ci`.
- `gcloud auth application-default login` - if your development machine has application default credentials from the Google Cloud CLI, we will use them if none of the above credentials are present.

### Cloud Functions Emulator

The Cloud Functions emulator is exposed through commands like `emulators:start`,
`serve` and `functions:shell`. Emulated Cloud Functions run as independent `node` processes
on your development machine which means they have their own credential discovery mechanism.

By default these `node` processes are not able to discover credentials from `firebase login`.
In order to provide a better development experience, when you are logged in to the CLI
through `firebase login` we take the user credentials and construct a temporary credential
that we pass into the emulator through `GOOGLE_APPLICATION_CREDENTIALS`. We **only** do this
if you have not already set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable
yourself.

## Using with CI Systems

The Firebase CLI requires a browser to complete authentication, but is fully
compatible with CI and other headless environments.

1. On a machine with a browser, install the Firebase CLI.
2. Run `firebase login:ci` to log in and print out a new [refresh token](https://developers.google.com/identity/protocols/OAuth2)
   (the current CLI session will not be affected).
3. Store the output token in a secure but accessible way in your CI system.

There are two ways to use this token when running Firebase commands:

1. Store the token as the environment variable `FIREBASE_TOKEN` and it will
   automatically be utilized.
2. Run all commands with the `--token <token>` flag in your CI system.

The order of precedence for token loading is flag, environment variable, active project.

On any machine with the Firebase CLI, running `firebase logout --token <token>`
will immediately revoke access for the specified token.

## Using as a Module

The Firebase CLI can also be used programmatically as a standard Node module. Each command is exposed as a function that takes an options object and returns a Promise. For example:

```js
var client = require("firebase-tools");
client.projects
  .list()
  .then(function(data) {
    console.log(data);
  })
  .catch(function(err) {
    // handle error
  });

client
  .deploy({
    project: "myfirebase",
    token: process.env.FIREBASE_TOKEN,
    force: true,
    cwd: "/path/to/project/folder",
  })
  .then(function() {
    console.log("Rules have been deployed!");
  })
  .catch(function(err) {
    // handle error
  });
```

Some commands, such as `firebase use` require both positional arguments and options flags. In this case you first
provide any positional arguments as strings followed by an object containing the options:

```js
var client = require("firebase-tools");
client
  .use("projectId", {
    // Equivalent to --add when using the CLI
    add: true,
  })
  .then(function(data) {
    console.log(data);
  })
  .catch(function(err) {
    // handle error
  });
```

Note: when used in a limited environment like Cloud Functions, not all `firebase-tools` commands will work programatically
because they require access to a local filesystem.

[gh-actions]: https://github.com/firebase/firebase-tools/actions
[npm]: https://www.npmjs.com/package/firebase-tools
[gh-actions-badge]: https://github.com/firebase/firebase-tools/workflows/CI%20Tests/badge.svg
[node-badge]: https://img.shields.io/node/v/firebase-tools.svg
[npm-badge]: https://img.shields.io/npm/v/firebase-tools.svg
