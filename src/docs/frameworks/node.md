---
Node Runtime
---

The Node runtime supports NPM, Yarn.

## Node Version
Supporting major versions:
- `18` (Default)
The version can be specified at:
- `engines.node` field in `package.json`
Only a major version should be specified. For example, `18`.

## Global Install
Installing global required dependencies with `npm install --g ` command. 
Ex: `yarn` is installed using `npm install --g yarn`

## Dependencies
Dependencies present only in `package.json` are identified.

## Framework Matcher
Identifies the best matching framework spec. If multiple framework specs are matched then we exit with an error message.

## Install
Either NPM or YARN based on the lock file (default installation is via NPM) are used to install the Dependencies present in `package.json`.

## Build
Priority for Build command:
- If there is a build script from `package.json`: executed as `<packageManager> run build`.
- If there is a build command from the framework spec: executed as `npx <buildCmd>`. It's `npx` for NPM or YARN.

## Run
Priority for Run command:
- If a start script from `package.json`: executed as `<packageManager> run start`.
- If a run command from the framework spec : executed as `npx <runCmd>`. 
- If Main file is `index.js`

## Dev
Priority for Dev command:
- If a dev script from `package.json`: executed as `<packageManager> run dev`.
- If a dev command from the framework spec: executed as `npx <devCmd>`. 
