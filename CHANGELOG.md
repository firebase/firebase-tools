## v1.1.3
- Fixes progress bar so it doesn't stick at 100% at the end of long uploads
- Improves error messaging on login / token validation if the CLI version is out of date

## v1.1.2
- Adds client-side validation of new advanced features with better error messaging

## v1.1.1
- Adds a brief description of each template inline when running `firebase bootstrap`

## v1.1.0
- Supports new advanced features parameters in the `firebase.json` to allow greater customization of hosting parameters
- improves default "ignore" rules to specify any dot file, regardless of whether in a sub-directory

- - -

## v1.0.6
- Adds `-s` functionality to all commands for silent mode while scripting - commands will error with non-zero status code instead of waiting for prompt if not enough information supplied
- `delete-site` command as a convenience method for removing a site from hosting. Site shows up as 'Site Not Found' as if never deployed to

## v1.0.5
- Gracefully handles error caused by symlinks in public directory until [isaacs/fstream#16](https://github.com/isaacs/fstream/pull/16) fix

## v1.0.4
- NPM artifact fix

## v1.0.3
- Allows command line params in `firebase deploy` to override `firebase.json` settings

## v1.0.2
- Enforces node 0.10.x and above after shown not to work on previous versions

## v1.0.1
- Fixes bug with `firebase bootstrap` on windows
- Adds 'ignore' to `firebase.json` to allow files to be ignored on deploy
- Prioritizes `--email` and `--password` command line arguments over current auth token if both passed
