# Integrate SvelteKit

Using the Firebase CLI, you can deploy your SvelteKit apps to Firebase and
serve them with Firebase Hosting. The CLI respects your SvelteKit settings and
translates them to Firebase settings with zero or minimal extra configuration on
your part. If your app includes dynamic server-side logic, the CLI deploys that
logic to Cloud Functions for Firebase.

Note: Framework-aware Hosting is an early public preview. This means
that the functionality might change in backward-incompatible ways. A preview
release is not subject to any SLA or deprecation policy and may receive limited
or no support.

## Before you begin

Before you get started deploying your app to Firebase,
review the following requirements and options:

- Firebase CLI version 12.1.0 or later. Make sure to
  [install the CLI](https://firebase.google.com/docs/cli#install_the_firebase_cli)
  using your preferred method.
- Optional: Billing enabled on your Firebase project
  (required if you plan to use SSR)
- An existing SvelteKit project. You can create one with `npm init svelte@latest`.


## Initialize Firebase

To get started, initialize Firebase for your framework project.
Use the Firebase CLI for a new project, or modify `firebase.json` for an
existing project.

### Initialize a new project

1. In the Firebase CLI, enable the web frameworks preview:
   <pre class="devsite-terminal">firebase experiments:enable webframeworks</pre>
1. Run the initialization command from the CLI and then follow the prompts:
   <pre class="devsite-terminal">firebase init hosting</pre>
1.  Answer yes to "Do you want to use a web framework? (experimental)"
1.  Choose your hosting source directory. 
    If there is an existing SvelteKit codebase,
    the CLI detects it and the process completes.

## Serve static content

If your app uses 
[`@sveltejs/adapter-static`](https://kit.svelte.dev/docs/adapter-static), 
the Firebase CLI will correctly detect and configure your build to serve fully
static content on Firebase Hosting.

## Server-side rendering

Firebase supports both server-side rendering and a mix of prerendering and SSR. 
Unless you are using `@sveltejs/adapter-static`, all pages are rendered on the 
server at runtime by default, but you can opt in to prerendering for certain 
routes by adding `export const prerender = true` to the relevant `+layout.js` 
or `+page.js` files. 
See detailed instructions for setting 
[page options](https://kit.svelte.dev/docs/page-options).

## Deployment

If you want to deploy an entirely static site, 
install and configure `@sveltejs/adapter-static`. 
The static files will be deployed to Firebase Hosting, no Cloud Functions required.

If you have a mix of static and server-rendered pages, 
it is not necessary to install a special deployment adapter. 
Leave the default configuration of `@sveltejs/adapter-auto`. 
The necessary dynamic logic will be created and deployed to Cloud Functions.

Run `firebase deploy` to build and deploy your SvelteKit app.