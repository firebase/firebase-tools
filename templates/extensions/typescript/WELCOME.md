This directory now contains the source files for a simple extension called **greet-the-world**. You can try it out right away in the Firebase Emulator suite: first, compile your code by running:

`npm run build --prefix=functions`

Then, navigate to the `functions/integration-test` directory and run:

`firebase emulators:start --project=<project-id>`

If you don't have a project to use, you can instead use '--project=demo-test' to run against a fake project.

The `integration-test` directory also includes an end to end test (in the file **integration-test.spec.ts**) that verifies that the extension responds back with the expected greeting. You can see it in action by running:

`npm run test`

If you want to jump into the code to customize your extension, then modify **index.ts** and **extension.yaml** in your favorite editor. 

If you want to deploy your extension to test on a real project, go to a Firebase project directory (or create a new one with `firebase init`) and run:

`firebase ext:install ./path/to/extension/directory --project=<project-id>`
`firebase deploy --only extensions`

You can find more information about building extensions in the publisher docs: https://firebase.google.com/docs/extensions/publishers/get-started
