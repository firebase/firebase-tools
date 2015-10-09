# firebase-cli

[![Build Status](https://travis-ci.org/firebase/firebase-tools.svg?branch=master)](https://travis-ci.org/firebase/firebase-tools)
[![Coverage Status](https://img.shields.io/coveralls/firebase/firebase-tools.svg?branch=master&style=flat)](https://coveralls.io/r/firebase/firebase-tools)
[![NPM version](https://badge.fury.io/js/firebase-tools.svg)](http://badge.fury.io/js/firebase-tools)

These are the Firebase Command Line (CLI) Tools. They can be used to:

* Administer your Firebase account
* Run a local web server for your Firebase Hosting site
* Interact with data in your Firebase databases
* Deploy Hosting and Security Rules to Firebase

To get started with the Firebase CLI, [read through our command line documentation]((https://www.firebase.com/docs/hosting/command-line-tool.html).


## Installation

To install the Firebase CLI, you first need to [sign up for a Firebase account](https://www.firebase.com/signup/).

Then you need to install [Node.js](http://nodejs.org/) and [npm](https://npmjs.org/). Note that
installing Node.js should install npm as well.

Once npm is installed, get the Firebase CLI by running the following command:

```bash
npm install -g firebase-cli
```

This will provide you with the globally accessible `firebase` command.


## Commands

**The command `firebase --help` lists the available commands and `firebase <command> --help` shows more details for an individual command.**

If a command is project-specific, you must either be in a directory with a
`firebase.json` configuration file in its parent tree or specify the Firebase
project name with the `-f <project>` flag.

Below is a brief list of the available commands and their function:

### Administrative Commands

Command Name | Description
------------ | -----------
**login** | Authenticate to your Firebase account. Requires access to a web browser.
**logout** | Remove locally stored Firebase authentication information.
**list** | List out all Firebase projects to which you have access.
**open** | Open the deployed Firebase Hosting site or various dashboard panels for the current Firebase project.
**init** | Setup a new Firebase project in your local system. This command will create a [firebase.json][1] configuration file for you in the current directory.
**help** | Display help information about the CLI or specific commands.
**prefs:token** | Print out the current user's access token for use in CI/headless systems.

### Deploy and Hosting Commands

These commands let you deploy and interact with your Firebase Hosting site.

Command Name | Description
------------ | -----------
**deploy** | Deploys all components (both hosting and security rules) of your Firebase project. Relies on [firebase.json][1] configuration.
**deploy:hosting** | Deploy only the Firebase Hosting site assets to your Firebase project. Relies on [firebase.json][1] configuration.
**deploy:rules** | Deploy only the Firebase Security Rules to your Firebase project. Relies on [firebase.json][1] configuration.
**disable:hosting** | Stop serving Firebase Hosting traffic for the current project. Instead, a "Site Not Found" message will be displayed.
**serve** | Start a local web server with your Firebase Hosting configuration. Relies on [firebase.json][1].

### Data Commands

Command Name | Description
------------ | -----------
**data:get** | Fetch data from the current project's database and display it as JSON. Supports querying on indexed data.
**data:set** | Replace all data at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**data:update** | Perform a partial update at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**data:push** | Push new data to a list at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**data:remove** | Delete all data at a specified location in the current project's database.

[1]:https://www.firebase.com/docs/hosting/guide/full-config.html

## Using the Firebase CLI with CI Systems

The Firebase CLI requires a browser to complete authentication, but is fully
compatible with CI and other headless environments.

1. On a machine with a browser, install the Firebase CLI and login.
2. Run `firebase prefs:token` to print out the access token once you've logged in.
3. Store the output token in a secure but accessible way in your CI system.
4. Run all commands with the `--token <token>` parameter in your CI system. For
   example, if I had my token stored as the environment variable `FIREBASE_TOKEN`
   I could run `firebase deploy --token $FIREBASE_TOKEN`
