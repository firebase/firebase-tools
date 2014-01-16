firebase-tools
============

These are the Firebase Command Line Tools for administering your account and
interacting with the Firebase Hosting beta.

## Installation
To install, first you'll need to [sign up](https://www.firebase.com/signup/) for
a Firebase account and have installed [Node.js](http://nodejs.org/) and
[npm](https://npmjs.org/). Then run
```shell
npm install -g firebase-tools
```
This will install the globally accessible command `firebase`
## Commands
The command `firebase --help` lists the available commands and
`firebase <command> --help` shows more details.

```shell
Usage: firebase <command>

  Available commands are:

  bootstrap
    Creates a new Firebase powered app from a number of prebuild templates to
    quickly get a project up and running. This creates a new folder and prompts
    you through all the required settings.

  deploy
    Deploys the current app to Firebase Hosting and creates your subdomain on
    firebaseapp.com if it doesn't exist already.

  init
    Initializes an existing Firebase app in the current directory and prompts
    you through configuring it for firebaseapp.com.

  list
    Lists the Firebases available to the currently logged in user.

  login
    Logs the user into Firebase. All commands that require login will prompt
    you if you're not currently logged in.

  logout
    Logs the user out of Firebase.

  --help
    Shows this help screen. Use `firebase <command> --help` for more detailed
    help instructions.

  --version
    Displays the current version.
```

For a quick start guide, see https://www.firebase.com/docs/hosting.html

## Credit
Inspired by [Luke Vivier](https://github.com/lvivier)'s Firebase command line tools.
