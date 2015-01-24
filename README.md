# firebase-tools

[![Build Status](https://travis-ci.org/firebase/firebase-tools.svg?branch=master)](https://travis-ci.org/firebase/firebase-tools)
[![Coverage Status](https://img.shields.io/coveralls/firebase/firebase-tools.svg?branch=master&style=flat)](https://coveralls.io/r/firebase/firebase-tools)
[![NPM version](https://badge.fury.io/js/firebase-tools.svg)](http://badge.fury.io/js/firebase-tools)

These are the Firebase Command Line (CLI) Tools. They can be used to:

* Administer your Firebase account
* Interact with [Firebase Hosting](https://www.firebase.com/hosting.html), our product to host your
static HTML, JS, CSS, images, etc.

To get started with the Firebase CLI, [read through our hosting quickstart guide](https://www.firebase.com/docs/hosting.html).


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

The command `firebase --help` lists the available commands and `firebase <command> --help` shows
more details for an individual command.

You can get more information about the available commands in our
[command line documentation](https://www.firebase.com/docs/hosting/command-line-tool.html).


## Credit

Inspired by [Luke Vivier](https://github.com/lvivier/)'s Firebase command line tools.
