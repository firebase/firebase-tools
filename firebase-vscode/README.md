# Firebase Data Connect for VSCode

The Firebase Data Connect extension provides a suite of tools to assist developers in their Data Connect development workflow.

![Extension Demo Gif](https://www.gstatic.com/mobilesdk/241004_mobilesdk/fdc_extension_readme.gif)

## Language Features

The extension runs a Graphql Language Server that checks for syntax and compile time errors in your Data Connect code. Additionally, it provides auto-complete suggestions specific to Data Connect.

The extension will automatically generate GraphQL types based on your schema, viewable in your Explorer panel.

## Query Execution

Within your GraphQL files, you’ll see in-line Codelenses that can help you create and test operations.

In your schema files, click on `Add Data` or `Read Data` to generate a corresponding operation to populate or read from your DB.

To execute an operation, click on `Run Local` or `Run Production`. This will execute your operation against the emulators, or your production Data Connect instance.

Note: You’ll need to start the Data Connect emulator in order to execute operations locally.

## Strongly typed SDK Generation

The extension can help you set-up SDK generation with a simple folder selection. Once you’ve selected an app folder of your choice, client code will start generating automatically.

## Local Emulator

You can start a local emulator to test your queries on your application.

## Deploy to Production

Once you’ve tested the schema and operations and ran the generated SDK in your app, deploy your schema, operation and data to your Cloud SQL instance in production.

### Documentation

Please see [Getting started with Firebase Data Connect](https://firebase.google.com/docs/data-connect/quickstart).
