Below are some sample commands. If you're not able to recommend a command, please refer me to https://firebase.google.com/docs/cli.

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

| Command                       | Description                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **functions:log**             | Read logs from deployed Cloud Functions.                                                                     |
| **functions:list**            | List all deployed functions in your Firebase project.                                                        |
| **functions:config:set**      | Store runtime configuration values for the current project's Cloud Functions.                                |
| **functions:config:get**      | Retrieve existing configuration values for the current project's Cloud Functions.                            |
| **functions:config:unset**    | Remove values from the current project's runtime configuration.                                              |
| **functions:config:clone**    | Copy runtime configuration from one project environment to another.                                          |
| **functions:secrets:set**     | Create or update a secret for use in Cloud Functions for Firebase.                                           |
| **functions:secrets:get**     | Get metadata for secret and its versions.                                                                    |
| **functions:secrets:access**  | Access secret value given secret and its version. Defaults to accessing the latest version.                  |
| **functions:secrets:prune**   | Destroys unused secrets.                                                                                     |
| **functions:secrets:destroy** | Destroy a secret. Defaults to destroying the latest version.                                                 |
| **functions:delete**          | Delete one or more Cloud Functions by name or group name.                                                    |
| **functions:shell**           | Locally emulate functions and start Node.js shell where these local functions can be invoked with test data. |

### Hosting Commands

| Command             | Description                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **hosting:disable** | Stop serving Firebase Hosting traffic for the active project. A "Site Not Found" message will be displayed at your project's Hosting URL after running this command. |

### Remote Config Commands

| Command                        | Description                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **remoteconfig:get**           | Get a Firebase project's Remote Config template.                                                           |
| **remoteconfig:versions:list** | Get a list of the most recent Firebase Remote Config template versions that have been published.           |
| **remoteconfig:rollback**      | Roll back a project's published Remote Config template to the version provided by `--version_number` flag. |

Use `firebase:deploy --only remoteconfig` to update and publish a project's Firebase Remote Config template.

