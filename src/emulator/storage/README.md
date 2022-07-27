# Firebase Storage emulator

The Firebase Storage Emulator can be used to help test and develop your Firebase project.

To get started with the Firebase Storage emulator or see what it can be used for,
check out the [documentation](https://firebase.google.com/docs/emulator-suite/connect_storage).

## Testing

The Firebase Storage Emulator has a full suite of unit and integration tests.

To run integration tests run the following command:

```base
npm run test:storage-emulator-integration
```

To run unit tests run the following command:

```base
npm run mocha src/emulator/storage
```

## Developing locally

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

Alternatively adding `"firebase-tools": "file:./YOUR_PATH_HERE/firebase-tools"`
into another repo's package.json dependencies will also execute code against the local repository.

#### Unlink your local repository

To un-link `firebase-tools` from your local repository, you can do any of the
following:

- run `npm uninstall -g firebase-tools`
- run `npm unlink` in your local repository
- re-install `firebase-tools` globally using `npm i -g firebase-tools`
