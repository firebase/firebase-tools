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

### Tab-completion

#### Bash

You can use tab completion for bash only if you have [bash_completion](https://salsa.debian.org/debian/bash-completion) installed on your machine.

To load tab-completion in your current shell run the following command:

```bash
source <(firebase completion bash)
```

Adding it to your `~/.bashrc` file will make the completions available everywhere:

```bash
firebase completion bash >> ~/.bashrc
```

#### Fish

To load tab-completion in your current shell run the following command:

```fish
firebase completion fish | source
```

Adding it to your `fish.config` file will make the completions available everywhere:

```fish
firebase completion fish >> $__fish_config_dir/config.fish
```

## Commands

**The command `firebase --help` lists the available commands and `firebase <command> --help` shows more details for an individual command.**

If a command is project-specific, you must either be inside a project directory with an
active project alias or specify the Firebase project id with the `-P <project_id>` flag.

Below is a brief list of the available commands and their function:

### Configuration Commands

| Command        | Description                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **login**      | Authenticate to your Firebase account. Requires access to a web browser.                                                                        |
| **logout**     | Sign out of the Firebase CLI.                                                                                                                   |
| **login:ci**   | Generate an authentication token for use in non-interactive environments.                                                                       |
| **login:add**  | Authorize the CLI for an additional account.                                                                                                    |
| **login:list** | List authorized CLI accounts.                                                                                                                   |
| **login:use**  | Set the default account to use for this project                                                                                                 |
| **use**        | Set active Firebase project, manage project aliases.                                                                                            |
| **open**       | Quickly open a browser to relevant project resources.                                                                                           |
| **init**       | Setup a new Firebase project in the current directory. This command will create a `firebase.json` configuration file in your current directory. |
| **help**       | Display help information about the CLI or specific commands.                                                                                    |

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

| Command           | Description                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **database:get**  | Fetch data from the current project's database and display it as JSON. Supports querying on indexed data.                           |
| **database:set**  | Replace all data at a specified location in the current project's database. Takes input from file, STDIN, or command-line argument. |
| **database:push** | Push new da                                                                                                                         |
