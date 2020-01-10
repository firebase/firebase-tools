* Adds the ability to select an extension to install from a list of available official extensions when `firebase ext:install -i` or `firebase ext:install --interactive` is run.
* Fixes a small bug that caused `false` values in the `options` object to be ignored. 
* Release Database Emulator v4.3.1.
* Fixes a bug where unidentified commands gave an unhelpful error message (#1889).
* Prevents potential false-negative permissions check errors from erroring command.
* Adds `-s, --site` flag to `hosting:disable` command, allowing it to be run against the non-default site of a project.
* During `init`, a provided `--project` will be respected and cause the selection prompt to be skipped.