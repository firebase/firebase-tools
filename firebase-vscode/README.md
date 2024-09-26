# Firebase Data Connect for VSCode

The Firebase Data Connect extension provides a suite of tools aimed to assist developers in their Data Connect development workflow.

## Language Features

The extension runs a Graphql Language Server that checks for syntax and compile time errors in your Data Connect code. Additionally, it provides auto-complete suggestions specific to Data Connect.

The extension will automatically generate GraphQL types based on your schema, viewable in your Explorer panel.

## Execution

Within your GraphQL files, you’ll see in-line Codelenses that can help you create and test operations.

In your schema files, click on `Add Data` or `Read Data` to generate a corresponding operation to populate or read from your DB.

To execute an operation, click on `Run Local` or `Run Production`. This will execute your operation against the emulators, or your production Data Connect instance.

Note: You’ll need to start the Data Connect emulator in order to execute operations locally.


## Generated SDK

The extension can help you set-up SDK generation with a simple folder selection. Once you’ve selected an app folder of your choice, client code will start generating automatically.


## Deploy to Production

Once you’ve written and tested out your schema and operations, deploy your code to your production Data Connect instance.
