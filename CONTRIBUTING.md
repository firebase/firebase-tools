# Firebase CLI Contributing Guide

## Overview

The Firebase CLI is a command-line tool to allow developers simple access to
Firebase services. The CLI is built to be a general-purpose tool for interacting
with Firebase, but it is particularly concerned with tasks related to deployment
and interaction between a developer's local project directory and Firebase.

## Audience

If you are a developer interested in contributing to the CLI, this is the
documentation for you! This guide describes how to be successful in contributing
to our repository.

## Getting Started

The Firebase CLI is generally developed in the open on GitHub in the
[firebase/firebase-tools][gh-repo] repo. We at Firebase even do our work on the
CLI directly within this repo whenever possible.

If you're interested in contributing code, get started by
[making a fork of the repository for your GitHub account](https://help.github.com/en/github/getting-started-with-github/fork-a-repo).

### Contribution Process

The preferred means of contribution to the CLI is by creating a branch in your
own fork, pushing your changes there, and submitting a Pull Request to the
`master` branch of `firebase/firebase-tools`.

If you believe that your change should be noted in the
[changelog](https://github.com/firebase/firebase-tools/releases), please also
add an entry to the `CHANGELOG.md` file. This log is emptied after every release
and is used to generate the release notes posted in the
[Releases](https://github.com/firebase/firebase-tools/releases) page. Markdown
formatting is respected (using the GitHub style).

NOTE: Any new files added to the repository **must** be written in TypeScript
and **must** include unit tests. There are very few exceptions to this rule.

After your Pull Request passes the tests and is approved by a Firebase CLI team
member, they will merge your PR. Thank you for your contribution!

### Setting up your development environment

When working on the Firebase CLI, you want to work using a clone of the project.

#### Link your local repository to your environment

After cloning the project, use `npm link` to globally link your local
repository:

```bash
git clone git@github.com:firebase/firebase-tools.git
cd firebase-tools
npm install # must be run the first time you clone
npm link  # installs dependencies, runs a build, links it into the environment
```

This link makes the `firebase` command execute against the code in your local
repository, rather than your globally installed version of `firebase-tools`.
This is great for manual testing.

#### Test locally while making changes

After you link your local repository to your environment, you may want to run
`npm run build:watch` in a separate terminal window to watch your local
repository for any changes and rebuild your source code when it does. These
updates will continue to work without having to run `npm link` repeatedly.

#### Detect what version of `firebase-tools` is being used

To determine if your version of `firebase-tools` is executing against your `npm
link`’d repository, run `npm ls` to print out global linked modules:

```bash
npm ls -g --depth=0 --link=true

# The output might resemble:
# /Users/{user}/.nvm/versions/node/v8.16.0/lib
# └── firebase-tools@7.14.0 -> /Users/{user}/Repositories/firebase-tools
```

#### Unlink your local repository

To un-link `firebase-tools` from your local repository, you can do any of the
following:

*   run `npm uninstall -g firebase-tools`
*   run `npm unlink` in your local repository
*   re-install `firebase-tools` globally using `npm i -g firebase-tools`

### Lint, Build, and Tests

While you're working on changes (and especially when preparing a Pull Request),
make sure all the applicable tests will pass with your changes.

The short version: run `npm test` in your local repository to run the majority
of the tests that are run by Firebase's CI systems.

#### Lint

We use `eslint` to do static analysis of all JavaScript and TypeScript files.
Generally speaking, `eslint` generates a lot of warnings, especially when it
comes to JavaScript files (because most of them are older code). A long-term
goal for Firebase is to eliminate most of these warnings in the codebase, but
it's a long process.

Note that `npm test` only errors if the linter finds errors in your codebase.
So, if you want to fix warnings for your changed files, you can run either of
the following commands:

*   Run `npm run lint` to view all warnings in your codebase.
*   Run `npm run lint:changed-files` to view only the warnings of files changed
    between your working branch and your copy of master. For this reason, it’s
    important to keep your master up-to-date; otherwise, you might see
    unnecessary warnings.

We also support an ongoing effort to convert existing JavaScript into
TypeScript. If you do a conversion of this nature, the new TypeScript file
should be as devoid of any lint warnings as possible. When you send your Pull
Request for review, you might be asked to run `npm run lint:changed-files` and
clean up any issues that arise.

#### Build

Since we use TypeScript, we compile our codebase to JavaScript in our deployment
process.

*   To do a development build, run `npm run build`.
*   To trigger the production build, run `npm run prepare`. The production build
    has several differences from the development build (for example, it doesn't
    include source maps).

#### Tests

Firebase runs a number of tests on pushes to the repository as well as on Pull
Requests. The majority of these tests are invoked via `npm run mocha`, and we
recommend that you run them locally with the same command.

However, some integration tests require a little more setup, so it’s best to
allow them to be run by the GitHub CI testing. There are additional integration
tests that GitHub CI will run when code is pushed to GitHub, but some of them
are unavailable to Pull Requests coming from forks of the repository.

### Repo structure

| path            | description                                               |
| --------------- | --------------------------------------------------------- |
| `src`           | Contains shared/support code for the commands             |
| `src/bin`       | Contains the runnable script. You shouldn't need to touch |
:                 : this content.                                             :
| `src/commands`  | Contains code for the commands, organized by              |
:                 : one-file-per-command with dashes.                         :
| `src/templates` | Contains static files needed for various reasons          |
:                 : (inittemplates, login success HTML, etc.)                 :
| `src/test`      | Contains tests. Mirrors the top-level directory structure |
:                 : (i.e., `src/test/commands` contains command tests and     :
:                 : `src/test/gcp` contains `gcp` tests)                      :

## Building CLI commands

IMPORTANT: The Firebase CLI is subject to Firebase API Council review and
approval. Any major new functionality must go through API review. The Firebase
CLI team will spearhead this process internally for external contributions; this
process can take a few weeks for large API changes.

### Setting up a new command

#### Create a file for your command

First, create a new file in `src/commands` for your new command, replacing
colons with dashes where appropriate. Populate the file with this basic content:

```typescript
import { Command } from "../command";

// `export default` is used for consistency in command files.
export default new Command("your:command")
  .description("a one-line description of your command")
  // .option("-e, --example <requiredValue>", "describe the option briefly")
  // .before(requireConfig) // add any necessary filters and require them above
  // .help(text) // additional help to be visible with --help or the help command
  .action(async (options) => {
    // options will be available at e.g. options.example
    // this should return a Promise that resolves to a reasonable result
  });
```

Here are a few style notes:

*   Command names
    *   may be namespaced using colons
    *   should be all lower-case letters
*   Arguments (in the command or an option)
    *   should be `lowerCamelCase`
*   Descriptions (of the command or an option)
    *   must be a single brief statement
    *   should not start with a capital letter
    *   must not end with a punctuation mark

If you want to provide more descriptive help than one line can generally
provide, the `Command.help` method accepts a long-form string to display for the
`--help` flag or the `help` command.

##### Build the Command object

`Command` provides a number of features to implement a command:

*   **Options:** To add an option, use `.option()` as in the example above. All
    options should have a short name and a long name, with multiple words in the
    long name separated by dashes. Options will be made available directly on
    the options object passed into the command's action.
*   **Arguments:** If your command takes an argument, you can append `<argName>`
    (required) or `[argName]` (optional) to the declaration in `new Command()`.
    This pattern works for options too.
*   **Befores:** The Firebase CLI comes with a number of ready-made `.before()`
    filters to do things like require a Firebase project directory, require
    authentication, require access to the current project, etc. To use these
    filters, require them from the src directory and add a `.before(fnName)` to
    your command declaration.

#### Load the command

Next, go to `command/index.js`, then add a line to load the command, for
example:

```javascript
client.use = loadCommand("use");
```

NOTE: `loadCommand` handles commands written in either JavaScript or TypeScript;
no special handling should be required.

### Making authenticated API calls

Your command likely needs to make authenticated API calls. The Firebase CLI uses
standard Google OAuth access tokens for all requests and is built for direct
REST calls (as opposed to using, for example, the
[googleapis](https://www.npmjs.com/package/googleapis) wrapper module). Before
you can make an authenticated call, you need to declare some level of
authorization. There are two `.before()` filters that you can use:

*   `requireAuth`: generally requires a user to be logged in to run the command,
    but does not require project-specific authorization. It is used in commands
    like `firebase projects:list` for account-level calls.
*   `requirePermissions`: requires that the authorized account have certain
    roles on the active project specified either by `firebase use` in a project
    directory or with the `--project` flag on the command itself. The second
    argument should be an array of granular IAM permissions, such as
    `firebasehosting.sites.update`.

### Designing scriptable commands

The Firebase CLI is designed to be require-able as a standard Node module.
Commands are namespaced functions:

```typescript
import * as cli from "firebase-tools";
cli.projects.list();
cli.functions.log();
```

You don't need to do anything special to support scriptability, simply ensure
that your `action` returns or resolves a useful value. For instance, a list
command should return an array of objects.

### Logging and terminal formatting

The Firebase CLI has a central logger available in `src/logger`. You should
never use `console.log()` when displaying output to the user.

```typescript
import { logger } from "../logger";

logger.info("This text will be displayed to the end user.");
logger.debug("This text will only show up in firebase-debug.log or running with --debug.");
```

In addition, the [cli-color](https://www.npmjs.com/package/cli-color) Node.js
library should be used for color/formatting of the output:

```typescript
import * as clc "cli-color";

// Generally, prefer template strings (using `backticks`), but this is a formatting example:
const out = "Formatting is " + clc.bold.underline("fun") + " and " + clc.green("easy") + ".";
```

Colors will automatically be stripped from environments that do not support
them, so you should feel free to include output formatting. A few conventions
exist for output formatting:

*   Use the color red only for error text.
*   Use **bold** to call out identifiers (such as product IDs).
*   Use the color cyan as a prefix color to categorize output.

### Handling errors

By default, the Firebase CLI will handle all unrecognized errors by displaying
an "Unknown Error" to the user and logging information to `firebase-debug.log`.
These also return exit code 2.

To handle "expected" errors (for instance, a parse error in a user-provided
file), throw a `FirebaseError` with a friendly error message. The original error
may be provided as well. Here's an example:

```typescript
import * as clc from "cli-color";
import { FirebaseError } from "../error";

async function myFunc(options: any): void {
  try {
    return await somethingThatMayFail(options.projectId);
  } catch (err: any) {
    throw FirebaseError(`Project ${clc.bold(projectId)} caused an issue.', { original: err });
  }
}
```

## Testing

### Testing your command

You can manually test your new command by globally linking any `firebase`
commands to the local copy of the CLI rather than the public copy. Refer to
"Development Setup" for how to do this.

It might also be helpful to run commands with the --debug flag for more verbose
output. This output will be streamed to the terminal and saved inside a
`firebase-debug.log` file that is created in your local repository.

```bash
cd firebase-tools
npm link

cd path/to/test/project
firebase <command> --debug
```

[gh-repo]: https://github.com/firebase/firebase-tools
