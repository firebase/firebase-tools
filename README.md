# Firebase CLI

[![Actions Status][gh-actions-badge]][gh-actions] [![Node Version][node-badge]][npm] [![NPM version][npm-badge]][npm]

The Firebase Command Line Interface (CLI) Tools enable you to test, manage, and deploy your Firebase projects directly from the command line. This comprehensive guide details all features, commands, installation steps, and more.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
   - [Using Node.js and npm](#using-nodejs-and-npm)
   - [Using Standalone Binary](#using-standalone-binary)
3. [Authentication](#authentication)
   - [General Authentication Methods](#general-authentication-methods)
   - [Multiple Accounts](#multiple-accounts)
4. [Using Firebase CLI Commands](#using-firebase-cli-commands)
   - [Configuration Commands](#configuration-commands)
   - [Project Management Commands](#project-management-commands)
   - [Deployment and Emulation](#deployment-and-emulation)
   - [Realtime Database Commands](#realtime-database-commands)
   - [Cloud Firestore Commands](#cloud-firestore-commands)
   - [Cloud Functions Commands](#cloud-functions-commands)
   - [Hosting Commands](#hosting-commands)
   - [Remote Config Commands](#remote-config-commands)
   - [Extensions Commands](#extensions-commands)
5. [Cloud Functions Emulator](#cloud-functions-emulator)
6. [Using Behind a Proxy](#using-behind-a-proxy)
7. [Using with CI Systems](#using-with-ci-systems)
8. [Full List of Commands](#full-list-of-commands)
9. [Additional Resources](#additional-resources)

---

## Overview

The Firebase CLI provides a seamless way to manage your Firebase projects and interact with its various features. It allows you to:
- Deploy code and assets to Firebase Hosting.
- Run local Firebase emulators for development.
- Interact with Firebase databases and perform operations.
- Distribute app builds and manage Firebase extensions.

The CLI is particularly useful for developers seeking an integrated workflow, from development to deployment.

---

## Installation

### Using Node.js and npm

You can install the Firebase CLI via npm. Ensure you have [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed.

```bash
npm install -g firebase-tools
```

This installs the CLI globally, making the `firebase` command accessible from any directory.

### Using Standalone Binary

To download and install the Firebase CLI without dependencies, use:

```bash
curl -sL firebase.tools | bash
```

This command downloads a standalone binary executable for the CLI.

---

## Authentication

### General Authentication Methods

The Firebase CLI supports the following authentication methods:

1. **User Token** (Deprecated): Generate a long-lived token via `firebase login:ci`. Use `--token` or set `FIREBASE_TOKEN` to authenticate.
2. **Local Login**: Authenticate with `firebase login`.
3. **Service Account**: Set `GOOGLE_APPLICATION_CREDENTIALS` to point to a JSON key file.
4. **Application Default Credentials**: Use `gcloud auth application-default login` to authenticate.

### Multiple Accounts

The CLI supports multiple Firebase accounts:
- Use `firebase login:add` to authorize additional accounts.
- Use `firebase login:use` to switch between accounts.

---

## Using Firebase CLI Commands

### Configuration Commands

| Command        | Description                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **login**      | Authenticate to your Firebase account. Requires a browser.                                                                                     |
| **logout**     | Sign out of the CLI.                                                                                                                            |
| **init**       | Initialize a Firebase project in the current directory.                                                                                         |
| **help**       | Display help information.                                                                                                                       |
| **login:ci**   | Generate an authentication token for use in non-interactive environments.                                                                       |
| **login:add**  | Authorize the CLI for an additional account.                                                                                                    |
| **login:list** | List authorized CLI accounts.                                                                                                                   |
| **login:use**  | Set the default account to use for this project                                                                                                 |
| **use**        | Set active Firebase project, manage project aliases.                                                                                            |
| **open**       | Quickly open a browser to relevant project resources.                                                                                           |

---

### Project Management Commands

| Command                  | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| **apps:create**          | Create a new Firebase app in a project.                    |
| **apps:list**            | List the registered apps of a Firebase project.            |
| **apps:sdkconfig**       | Print the configuration of a Firebase app.                 |
| **projects:addfirebase** | Add Firebase resources to a Google Cloud Platform project. |
| **projects:create**      | Create a new Firebase project.                             |
| **projects:list**        | Print a list of all of your Firebase projects.             |

---

### Deployment and Emulation

| Command                       | Description                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **deploy**                    | Deploys your Firebase project.                                                                                                |
| **emulators:start**           | Start the local Firebase emulators.                                                                                           |
| **serve**                     | Start a local server for Hosting and Cloud Functions.                                                                          |

---

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

---

### Cloud Firestore Commands

| Command               | Description                                     |
| --------------------- | ----------------------------------------------- |
| **firestore:delete**  | Delete documents or collections.                |
| **firestore:indexes** | List deployed indexes.                          |

---

### Cloud Functions Commands

| Command                       | Description                                  |
| ----------------------------- | -------------------------------------------- |
| **functions:list**            | List deployed functions.                    |
| **functions:config:set**      | Set configuration values.                   |
| **functions:log**             | Retrieve Cloud Functions logs.              |

---

### Hosting Commands

| Command             | Description                                         |
| ------------------- | --------------------------------------------------- |
| **hosting:disable** | Disable Hosting for the project.                   |

---

### Remote Config Commands

| Command                        | Description                                         |
| ------------------------------ | -------------------------------------------------- |
| **remoteconfig:get**           | Fetch the current Remote Config template.         |
| **remoteconfig:rollback**      | Roll back to a specified template version.        |

---

### Extensions Commands

| Command             | Description                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- |
| **ext**             | Display information on how to use ext commands and extensions installed to your project.    |
| **ext:configure**   | Configure an existing extension instance.                                                   |
| **ext:info**        | Display information about an extension by name (extensionName@x.y.z for a specific version) |
| **ext:install**     | Install an extension.                                                                       |
| **ext:sdk:install** | Install and SDK for an extension so you can define the extension in a functions codebase.   |
| **ext:list**        | List all the extensions that are installed in your Firebase project.                        |
| **ext:uninstall**   | Uninstall an extension that is installed in your Firebase project by Instance ID.           |
| **ext:update**      | Update an existing extension instance to the latest version.                                |

---

## Cloud Functions Emulator

The Cloud Functions emulator allows you to test Cloud Functions locally. Use:

| Command               | Description                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **firestore:delete**  | Delete documents or collections from the current project's database. Supports recursive deletion of subcollections. |
| **firestore:indexes** | List all deployed indexes from the current project.                                                                 |

```bash
firebase emulators:start
```

---

## Using Behind a Proxy

Set the `HTTP_PROXY` or `HTTPS_PROXY` environment variable to configure a proxy:

```bash
export HTTPS_PROXY=http://proxy.server:port
```

---

## Using with CI Systems

To use Firebase CLI in CI environments:
1. Authenticate using `firebase login:ci`.
2. Export the token as an environment variable.
3. Use Firebase commands in CI scripts.

---

## Full List of Commands

Run `firebase --help` for the full list of commands and their options.

---

## Additional Resources

- [Firebase CLI Documentation](https://firebase.google.com/docs/cli)
- [Firebase Hosting Guide](https://firebase.google.com/docs/hosting)
