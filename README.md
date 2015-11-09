# firebase-tools

[![Build Status](https://travis-ci.org/firebase/firebase-tools.svg?branch=master)](https://travis-ci.org/firebase/firebase-tools)
[![Coverage Status](https://img.shields.io/coveralls/firebase/firebase-tools.svg?branch=master&style=flat)](https://coveralls.io/r/firebase/firebase-tools)
[![NPM version](https://badge.fury.io/js/firebase-tools.svg)](http://badge.fury.io/js/firebase-tools)

These are the Firebase Command Line (CLI) Tools. They can be used to:

* Administer your Firebase account
* Run a local web server for your Firebase Hosting site
* Interact with data in your Firebase database
* Deploy your site to Firebase Hosting
* Deploy Security Rules for your database

To get started with the Firebase CLI, read the full list of commands below or check out the [hosting-specific CLI documentation](https://www.firebase.com/docs/hosting/command-line-tool.html).


## Installation

To install the Firebase CLI, you first need to [sign up for a Firebase account](https://www.firebase.com/signup/).

Then you need to install [Node.js](http://nodejs.org/) and [npm](https://npmjs.org/). Note that
installing Node.js should install npm as well.

Once npm is installed, get the Firebase CLI by running the following command:

```bash
npm install -g firebase-tools
```

This will provide you with the globally accessible `firebase` command.


## Commands

**The command `firebase --help` lists the available commands and `firebase <command> --help` shows more details for an individual command.**

If a command is project-specific, you must either be inside a project directory with a
`firebase.json` configuration file or specify the Firebase project name with the `-f <project>` flag.

Below is a brief list of the available commands and their function:

### Administrative Commands

Command | Description
------- | -----------
**login** | Authenticate to your Firebase account. Requires access to a web browser.
**logout** | Sign out of the Firebase CLI.
**list** | Print a list of all of your Firebase projects.
**open** | Open the deployed Firebase Hosting site or various dashboard panels for the current Firebase project.
**init** | Setup a new Firebase project in the current directory. This command will create a [firebase.json][1] configuration file in your current directory.
**help** | Display help information about the CLI or specific commands.
**prefs:token** | Print out your authenticated access token for use in CI/headless systems.

### Deploy and Hosting Commands

These commands let you deploy and interact with your Firebase Hosting site.

Command | Description
------- | -----------
**deploy** | Deploys all components (both hosting and security rules) of your Firebase project. Relies on [firebase.json][1] configuration.
**deploy:hosting** | Deploy only the Firebase Hosting site assets to your Firebase project. Relies on [firebase.json][1] configuration.
**deploy:rules** | Deploy only the Firebase Security Rules to your Firebase project. Relies on [firebase.json][1] configuration.
**disable:hosting** | Stop serving Firebase Hosting traffic for the current project. A "Site Not Found" message will be displayed at your URL after running this command.
**serve** | Start a local web server with your Firebase Hosting configuration. Relies on [firebase.json][1].

### Data Commands

Command | Description
------- | -----------
**data:get** | Fetch data from the current project's database and display it as JSON. Supports querying on indexed data.
**data:set** | Replace all data at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**data:update** | Perform a partial update at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**data:push** | Push new data to a list at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**data:remove** | Delete all data at a specified location in the current project's database.

[1]:https://www.firebase.com/docs/hosting/guide/full-config.html

## Using with CI Systems

The Firebase CLI requires a browser to complete authentication, but is fully
compatible with CI and other headless environments.

1. On a machine with a browser, install the Firebase CLI.
2. Run `firebase login:ci` to log in and print out a new access token
   (the current CLI session will not be affected).
3. Store the output token in a secure but accessible way in your CI system.

There are two ways to use this token when running Firebase commands:

1. Store the token as the environment variable `FIREBASE_TOKEN` and it will
   automatically be utilized.
2. Run all commands with the `--token <token>` flag in your CI system. You
   may need to quote the token for it to be passed properly (e.g. `firebase deploy --token '-JXXXX|YYYYY'`).

The order of precedence for token loading is flag, environment variable, config file.

On any machine with firebase-tools, running `firebase logout --token <token>`
will immediately revoke access to the specified token.

## Using as a Module

The Firebase CLI can also be used programmatically as a standard Node module. Each command is exposed as a function that takes an options object and returns a Promise. For example:

```js
var client = require('firebase-tools');
client.list().then(function(data) {
  console.log(data);
}).catch(function(err) {
  // handle error
});

client.deploy.rules({
  firebase: 'myfirebase',
  token: process.env.FIREBASE_TOKEN,
  cwd: '/path/to/project/folder'
}).then(function() {
  console.log('Rules have been deployed!')
}).catch(function(err) {
  // handle error
});
```
