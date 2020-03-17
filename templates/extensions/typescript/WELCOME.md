This directory now contains the source files for a simple extension called **greet-the-world**. To try out this extension right away, install it in an existing Firebase project by running:

`npm run build --prefix=functions && firebase ext:install . --project=<project-id>`

If you want to jump into the code to customize your extension, then modify **index.ts** and **extension.yaml** in your favorite editor. When you're ready to try out your fancy new extension, run:

`npm run build --prefix=functions && firebase ext:install . --project=<project-id>`

As always, you can find detailed instructions for creating your own extension in the docs.
