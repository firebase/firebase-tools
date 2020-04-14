# firepit-builder

This folder contains the source for the `firepit-builder` [Docker](https://www.docker.com) image along with the tools for locally building the standalone (`firepit`) builds of the `firebase-tools` package.

This directory does not contain the `firepit` source which is located at [`/standalone`](/standalone).

# Building Locally

The script [`pipeline.js`](/scripts/firepit-builder/pipeline.js) is used in the [`cloud_build.yaml`](/scripts/publish/cloudbuild.yaml#L74) configuration for automated builds, but can also be used locally for manually creating `firepit` builds from non-published `firebase-tools` builds or to test updates to the `firepit` runtime.

To create a build locally, follow these steps.

1. You will need to install [`hub`](https://github.com/github/hub), the Github CLI.
1. Obtain an instance of the `firebase-tools` repo and make your changes and/or updates to either the CLI itself or the `firepit` runtime
1. Ensure that the `firebase-tools` folder has been built (via `npm run build`).
1. Go to the `scripts/firepit-builder` directory and run `npm install`.
1. Run `node ./pipeline.js --package="/absolute/path/to/firebase-tools"`
1. If successful, the script will print out a list of binary artfiacts.

## Pipeline Arguments

The `pipeline.js` script has a few optional arguments which may be useful.

- `--package=[npm_package]` (default: firebase-tools@latest) - This value is used as `npm install [npm_package]` so it can either be a public package (like `firebase-tools@7` or an absolute local path to a built version of the CLI (like `/home/abe/Development/firebase-tools`).
- `--styles=[headless,headful]` (default: headless,headful) - This value specifies which style of `firepit` binary to build. The `headless` builds are used mostly on Unix systems and create binaries which mimic the normal `firebase` command. The `headful` builds are only shipped for Windows and are designed to be double-clicked and open a new command window.
- `--publish` This flag is used when you want to publish the artifacts to Github. This is a dangerous and potentially destructive command. You should probably never use it.
