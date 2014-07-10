# firebase-tools

[![NPM version](https://badge.fury.io/js/firebase-tools.svg)](http://badge.fury.io/js/firebase-tools)

These are the Firebase Command Line (CLI) Tools. They can be used to:

* Administer your Firebase account
* Interact with [Firebase Hosting](https://www.firebase.com/hosting.html), our product to host your HTML, JS, CSS, images, etc.

To get started with the Firebase CLI, [read through our hosting quickstart guide](https://www.firebase.com/docs/hosting.html).

## Installation

To install the Firebase CLI, you first need to [sign up for a Firebase account](https://www.firebase.com/signup/).
Then you need to install [Node.js](http://nodejs.org/) and [npm](https://npmjs.org/).
Note that installing Node.js should install npm as well.

Once npm is installed, get the Firebase CLI by running the following shell command:

```shell
npm install -g firebase-tools
```

This will provide you with the globally accessible `firebase` command.

## Commands

The command `firebase --help` lists the available commands and
`firebase <command> --help` shows more details for an individual command.

Here is the output of running `firebase --help`:

```shell
Usage: firebase <command>

  Available commands are:

  bootstrap
    Creates a new Firebase powered app from a prebuilt template to quickly
    get a project up and running. This creates a new folder and prompts
    you through all the required settings.

  deploy
    Deploys the current app to Firebase Hosting and creates your subdomain on
    firebaseapp.com if it doesn't exist already.

  init
    Initializes an existing Firebase app in the current directory and prompts
    you through configuring it for firebaseapp.com.

  open
    Opens the URL of the current Firebase app in a browser.

  list
    Lists the Firebases available to the currently logged in user.

  delete-site
    Deletes the current app from Firebase Hosting and displays a
    'Site not Found' page as if the site had never been deployed to.

  login
    Logs the user into Firebase. All commands that require login will prompt
    you if you're not currently logged in.

  logout
    Logs the user out of Firebase.

  -h, --help
    Shows this help screen. Use `firebase <command> --help` for more
    detailed help instructions.

  -v, --version
    Displays the current version.

  -s, --silent
    Silent mode for scripting - commands will error with non-zero status code
    instead of waiting for prompt if not enough information supplied.
```

## Credit

Inspired by [Luke Vivier](https://github.com/lvivier/)'s Firebase command line tools.

## License
[MIT](http://firebase.mit-license.org)
