firebase-tools
============

These are the Firebase Command Line Tools for administering your account and interacting with the Firebase Hosting beta.

## Installation
To install, first you'll need to [sign up](https://www.firebase.com/signup/) for a Firebase account and have installed [Node.js](http://nodejs.org/) and [npm](https://npmjs.org/). Then run
```shell
npm install -g firebase-tools
```
## Commands
The `--help` or `-h` options list the available commands and their optional parameters:

```shell
Firebase Command Line Tools
Version 0.0.1
https://www.firebase.com

Usage: firebase <command>

  Possible commands are:

  login
    Authenticates with the Firebase servers and stores an access token locally.
    All commands that require authentication use this if no valid access token
    exists.
    --email     The email address of the account to attempt to log in with.
    --password  The password of the account to attempt to log in with.

  logout
    Invalidates and destroys any locally stored access tokens.
    -d  Optional flag to delete the settings file.

  list
    Lists the Firebases available to the currently logged in user.

  app init
    Initializes a Firebase app in the current directory.
    -f, --firebase  The name of the Firebase to initialize the app with.
    -p, --public    A directory containing all of the app's static files that
                    should deployed to Firebase Hosting. Defaults to the current
                    directory.
    -r, --rules     An optional file that contains security rules for the
                    Firebase.

  app bootstrap
    Creates a new Firebase app from a number of predetermined templates to
    quickly get a project up and running. Creates a new folder named after the
    Firebase it is initialized with.
    -f, --firebase  The name of the Firebase to initialize the app with.
    -t, --template  The name of the template to initialize the app with.

  app deploy
    Publishes the app in the current directory to Firebase Hosting. If a file
    containing the security rules has been provided, these are uploaded to the
    server.
```
