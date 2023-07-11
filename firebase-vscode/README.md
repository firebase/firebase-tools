# firebase-vscode README

This extension is in the development and exploration stage.

## Running

1. In order to make sure f5 launches the extension properly, first open your
   VS Code session from the `firebase-vscode` subdirectory (not the `firebase-tools` directory).
2. npm i (run this in both `firebase-tools` and `firebase-vscode`)
3. Make sure the extension `amodio.tsl-problem-matcher` is installed - this
   enables the watcher to work, otherwise the Extension Development Host
   will not automatically open on F5 when the compilation is done.
4. f5 to run opens new window
   f5 -> npm run watch defined in tasks.json
   My terminal didn't have npm available but yours might

Workaround if f5 doesnt work:

1. Execute `npm run watch` from within the vscode directory
   Aside: Running `npm run watch` or `npm run build` the extension is compiled into dist (extension.js)
   Changing code within extension is hot-reloaded
   Modifying extensions.js will not hot-reload
   source file src/extension.ts
2. Wait for completion
3. Hit play from the left nav

New code changes are automatically rebuilt if you have `watch` running, however the new VSCode Plugin-enabled window will not reflect changes until reloaded.
Manual reload from new window: "Developer: Reload Window" Default hotkey: cmd + R

The communication between UI and extension done via the broker (see webview.postMessage)
Web view uses react (carry-over from the hackweek project courtesy of Roman and Prakhar)

## Structure

Extention.ts main entry point, calls sidebar.ts and workflow.ts
sidebar.ts loads the UI from the webviews folder
workflow.ts is the driving component (logic source)
cli.ts wraps CLI methods, importing from firebase-tools/src

When workflow.ts needs to execute some CLI command, it defers to cli.ts

## State

currentOptions maintains the currentState of the plugin and is passed as a whole object to populate calls to the firebase-tools methods
`prepare` in the command includes a lot of

## Logic

Calling firebase-tools in general follows the stuff:

1. instead of calling `before`, call `requireAuth` instead
   requireAuth is a prerequisite for the plugin UI, needed
   Zero-state (before login) directs the user to sign in with google (using firebase-tools CLI)
2. prepare is an implicit command in the cmd class
3. action

requireAuth -> login with service account or check that you're already logged in via firebase-tools

## Open issues

Login changes in the CLI are not immediately reflected in the Plugin, requires restart
If logged-out in the middle of a plugin session, handle requireAuth errors gracefully
Plugin startup is flaky sometimes
Unit/Integration tests are not developed
Code cleanliness/structure TODOs
tsconfig.json's rootDirs includes ["src", "../src", "common"] which causes some issues with import autocomplete
Three package.jsons - one for monospace and one for the standalone plugin, and then root to copy the correct version
