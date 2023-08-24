# Integrate Nuxt

Using the Firebase CLI, you can deploy your Nuxt apps to Firebase and
serve them with Firebase Hosting. The CLI respects your Nuxt settings and
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
  [install the CLI](/docs/cli#install_the_firebase_cli)
  using your preferred method.
- Optional: Billing enabled on your Firebase project
  (required if you plan to use SSR)
- An existing Nuxt project. You can create one with `npx nuxi@latest init <project-name>`.


## Initialize Firebase

To get started, initialize Firebase for your framework project.
Use the Firebase CLI for a new project, or modify `firebase.json` for an
existing project.

### Initialize a new project

1. In the Firebase CLI, enable the web frameworks preview:
   <pre class="devsite-terminal">firebase experiments:enable webframeworks</pre>
2. Run the initialization command from the CLI and then follow the prompts:
   <pre class="devsite-terminal">firebase init hosting</pre>
3.  Answer yes to "Do you want to use a web framework? (experimental)"
4.  Choose your hosting source directory.
    If there is an existing Nuxt codebase,
    the CLI detects it and the process completes.

## Serve static content

If your app uses [`ssr: false`](https://nuxt.com/docs/api/configuration/nuxt-config#ssr), 
the Firebase CLI will correctly detect and configure your build to serve fully
static content on Firebase Hosting.

## Server-side rendering

The Firebase CLI will detect usage of [`ssr: true`](https://nuxt.com/docs/api/configuration/nuxt-config#ssr). 
In such cases, the {{cli}} will deploy functions to {{cloud_functions_full}} to run dynamic 
server code. You can view information about these functions, such as their domain and runtime
configuration, in the [Firebase console](https://console.firebase.google.com/project/_/functions).

## Deployment

TODO