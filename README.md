# Firebase CLI [![Build Status](https://travis-ci.org/firebase/firebase-tools.svg?branch=master)](https://travis-ci.org/firebase/firebase-tools) [![Coverage Status](https://img.shields.io/coveralls/firebase/firebase-tools.svg?branch=master&style=flat)](https://coveralls.io/r/firebase/firebase-tools) [![NPM version](https://badge.fury.io/js/firebase-tools.svg)](http://badge.fury.io/js/firebase-tools)

These are the Firebase Command Line Interface (CLI) Tools. They can be used to:

* Deploy code and assets to your Firebase projects
* Run a local web server for your Firebase Hosting site
* Interact with data in your Firebase database

To get started with the Firebase CLI, read the full list of commands below or check out the [hosting-specific CLI documentation](https://firebase.google.com/docs/hosting/quickstart).


## Installation

To install the Firebase CLI, you first need to [sign up for a Firebase account](https://firebase.google.com/).

Then you need to install [Node.js](http://nodejs.org/) and [npm](https://npmjs.org/). Note that
installing Node.js should install npm as well.

Once npm is installed, get the Firebase CLI by running the following command:

```bash
npm install -g firebase-tools
```

This will provide you with the globally accessible `firebase` command.


## Commands

**The command `firebase --help` lists the available commands and `firebase <command> --help` shows more details for an individual command.**

If a command is project-specific, you must either be inside a project directory with an
active project alias or specify the Firebase project id with the `-P <project_id>` flag.

Below is a brief list of the available commands and their function:

### Administrative Commands

Command | Description
------- | -----------
**login** | Authenticate to your Firebase account. Requires access to a web browser.
**logout** | Sign out of the Firebase CLI.
**login:ci** | Generate an authentication token for use in non-interactive environments.
**list** | Print a list of all of your Firebase projects.
**use** | Set active Firebase project, manage project aliases.
**open** | Quickly open a browser to relevant project resources.
**init** | Setup a new Firebase project in the current directory. This command will create a `firebase.json` configuration file in your current directory.
**help** | Display help information about the CLI or specific commands.

### Deployment and Local Development

These commands let you deploy and interact with your Firebase Hosting site.

Command | Description
------- | -----------
**deploy** | Deploys your Firebase project. Relies on `firebase.json` configuration and your local project folder.
**serve** | Start a local web server with your Firebase Hosting configuration. Relies on `firebase.json`.

### Database Commands

Command | Description
------- | -----------
**database:get** | Fetch data from the current project's database and display it as JSON. Supports querying on indexed data.
**database:set** | Replace all data at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**database:update** | Perform a partial update at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**database:push** | Push new data to a list at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument.
**database:remove** | Delete all data at a specified location in the current project's database.

### Hosting Commands

Command | Description
------- | -----------
**hosting:disable** | Stop serving Firebase Hosting traffic for the active project. A "Site Not Found" message will be displayed at your project's Hosting URL after running this command.

### Auth Commands

Command | Description
------- | -----------
**auth:import** | Batch importing accounts into Firebase from data file.

The supported file format are [csv](#auth_csv_format) and [json](#auth_json_format). Supported hash algorithms are `HMAC_SHA512`, `HMAC_SHA256`, `HMAC_SHA1`, `HMAC_MD5`, `MD5`, `PBKDF_SHA1`, `SCRYPT`, `BCRYPT`. Hash algorithm and related parameters should be specified in command.

#### <a name="auth_csv_format"></a>CSV format
Every line represents an user account. There must be at least 23 columns each line. The definition of each column is as followed. `UID` is required. If there's no value in other field, just leave that position empty. Quotation marks can also be added for all string fields.

Pos. | Name | Type
-------- | ---- | ----
1 | UID | String
2 | Email | String
3 | Email Verified | Boolean
4 | Password Hash | String(Base64 encoded)
5 | Password Salt | String(Base64 encoded)
6 | Display Name | String
7 | Photo URL | String
8 | Google:ID  | String
9 | Google:Email | String
10 | Google:Display Name | String
11 | Google:Photo URL | String
12 | Facebook:ID | String
13 | Facebook:Email | String
14 | Facebook:Display Name  | String
15 | Facebook:Photo URL | String
16 | Twitter:ID | String
17 | Twitter:Email | String
18 | Twitter:Display Name | String
19 | Twitter:Photo URL | String
20 | Github:ID | String
21 | Github:Email | String
22 | Github:Display Name | String
23 | Github:Photo URL | String

**<a name="example_account"></a>Example:**

```
111, test@test.org, false, Jlf7onfLbzqPNFP/1pqhx6fQF/w=, c2FsdC0x, Test User, http://photo.com/123, , , , , 123, test@test.org, Test FB User, http://photo.com/456, , , , , , , , ,
```
Note: Spaces between commas can be eliminated automatically. `Jlf7onfLbzqPNFP/1pqhx6fQF/w=` is base64 encoded string of HMAC_SHA1 hashed password and salt('salt-1' in this example. 'c2FsdC0x' is base64 encoded of 'salt-1').

#### <a name="auth_json_format"></a>JSON format
The JSON file should looks like this:
```js
{
  “users”: [
    {
      "localId": "111",
      "email": "test@test.org"
      "emailVerified": false,
      "passwordHash": "Jlf7onfLbzqPNFP/1pqhx6fQF/w=",
      "salt": "c2FsdC0x",
      "displayName": "Test User",
      "photoUrl": "http://photo.com/123",
      "providerUserInfo": [ {
        "providerId": "facebook.com",
        "rawId": "123",
        "email":  "test@test.org",
        "displayName": "Test FB User",
        "photoUrl": "http://photo.com/456"
      } ]
    }, {
      ...
    },
    ...
  ]
}

```

The first element of `users` in above JSON object represents the [example user account](#example_account) in previous section. All user accounts should be put in `users`. `localId` is actually `UID` and is required. `providerId` must be one of "google.com", "facebook.com", "github.com", and "twitter.com".

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
2. Run all commands with the `--token <token>` flag in your CI system.

The order of precedence for token loading is flag, environment variable, active project.

On any machine with the Firebase CLI, running `firebase logout --token <token>`
will immediately revoke access for the specified token.

## Using as a Module

The Firebase CLI can also be used programmatically as a standard Node module. Each command is exposed as a function that takes an options object and returns a Promise. For example:

```js
var client = require('firebase-tools');
client.list().then(function(data) {
  console.log(data);
}).catch(function(err) {
  // handle error
});

client.deploy({
  project: 'myfirebase',
  token: process.env.FIREBASE_TOKEN,
  cwd: '/path/to/project/folder'
}).then(function() {
  console.log('Rules have been deployed!')
}).catch(function(err) {
  // handle error
});
```
