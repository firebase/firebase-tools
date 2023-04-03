Project: /docs/hosting/_project.yaml
Book: /docs/_book.yaml
page_type: guide

{% include "_shared/apis/console/_local_variables.html" %}
{% include "_local_variables.html" %}
{% include "docs/hosting/_local_variables.html" %}

<link rel="stylesheet" type="text/css" href="/styles/docs.css" />

# Integrate other frameworks with Express.js

With some additional configuration, you can build on the basic
framework-aware {{cli}} functionality
to extend integration support to frameworks other than Angular and Next.js.

<<_includes/_preview-disclaimer.md>>

<<_includes/_before-you-begin.md>>

- Optional: Billing enabled on your Firebase project
  (required if you plan to use SSR)

<<_includes/_initialize-firebase.md>>

1. Choose your hosting source directory; this could be an existing web app.
1. Choose "Dynamic web hosting with web framework."
1. Choose Express.js / custom

### Initialize an existing project

Change your hosting config in `firebase.json` to have a `source` option, rather
than a `public` option. For example:

```json
{
  "hosting": {
    "source": "./path-to-your-express-directory"
  }
}
```

## Serve static content

Before deploying static content, you'll need to configure your application.

### Configure

In order to know how to deploy your application, the {{firebase_cli}} needs to be
able to both build your app and know where your tooling places the assets
destined for {{hosting}}. This is accomplished with the npm build script and CJS
directories directive in `package.json`.

Given the following package.json:

```json
{
    "name": "express-app",
    "version": "0.0.0",
    "scripts": {
        "build": "spack",
        "static": "cp static/* dist",
        "prerender": "ts-node prerender.ts"
    },
    …
}
```

The {{firebase_cli}} only calls your build script, so you’ll need to ensure that
your build script is exhaustive.

Tip: you can add additional steps using` &&`. If you have a lot of steps,
consider a shell script or tooling like [npm-run-all](https://www.npmjs.com/package/npm-run-all)
or [wireit](https://www.npmjs.com/package/wireit).

```json
{
    "name": "express-app",
    "version": "0.0.0",
    "scripts": {
        "build": "spack && npm run static && npm run prerender",
        "static": "cp static/* dist",
        "prerender": "ts-node prerender.ts"
    },
    …
}
```

If your framework doesn’t support pre-rendering out of the box, consider using a
tool like [Rendertron](https://github.com/GoogleChrome/rendertron). Rendertron
will allow you to make headless Chrome requests against a local instance of your
app, so you can save the resulting HTML to be served on {{hosting}}.

Finally, different frameworks and build tools store their artifacts in different
places. Use `directories.serve` to tell the {{cli}} where your build script is
outputting the resulting artifacts:

```json
{
    "name": "express-app",
    "version": "0.0.0",
    "scripts": {
        "build": "spack && npm run static && npm run prerender",
        "static": "cp static/* dist",
        "prerender": "ts-node prerender.ts"
    },
    "directories": {
        "serve": "dist"
    },
    …
}
```

### Deploy

After configuring your app, you can serve static content with the standard
deployment command:

```shell
firebase deploy
```

## Serve Dynamic Content

To serve your Express app on {{cloud_functions_full}}, ensure that your Express app (or
express-style URL handler) is exported in such a way that Firebase can find it
after your library has been npm packed.

To accomplish this, ensure that your `files` directive includes everything
needed for the server, and that your main entry point is set up correctly in
`package.json`:

```json
{
    "name": "express-app",
    "version": "0.0.0",
    "scripts": {
        "build": "spack && npm run static && npm run prerender",
        "static": "cp static/* dist",
        "prerender": "ts-node tools/prerender.ts"
    },
    "directories": {
        "serve": "dist"
    },
    "files": ["dist", "server.js"],
    "main": "server.js",
    ...
}
```

Export your express app from a function named `app`:

```js
// server.js
export function app() {
  const server = express();
   …
   return server;
}
```

Or if you’d rather export an express-style URL handler, name it `handle`:

```js
export function handle(req, res) {
   res.send(‘hello world’);
}
```

### Deploy

```shell
firebase deploy
```

This deploys your static content to {{firebase_hosting}} and allows Firebase to
fall back to your Express app hosted on {{cloud_functions_full}}.

## Optional: integrate with Firebase Authentication

The web framework-aware Firebase deploy tooling will automatically keep client
and server state in sync using cookies. To access the authentication context,
the Express `res.locals` object optionally contains an authenticated Firebase
App instance (`firebaseApp`) and the currently signed in User (`currentUser`).
