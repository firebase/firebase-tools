# Integrate Vite

Using the Firebase CLI, you can deploy your Vite-powered sites to Firebase 
and serve them with Firebase Hosting. The following instructions also apply
to React, Preact, Lit, and Svelte as they are built on the Vite integration.

Note: Framework-aware Hosting is an early public preview. This means
that the functionality might change in backward-incompatible ways. A preview
release is not subject to any SLA or deprecation policy and may receive limited
or no support.

## Before you begin

Before you get started deploying your app to Firebase,
review the following requirements and options:

- Firebase CLI version 12.1.0 or later. Make sure to
  [install the CLI](https://firebase.google.com/docs/cli#install_the_firebase_cli) using your preferred 
	method.
- Optional: An existing Vite project. You can create one with 
	`npm create vite@latest` or let the Firebase CLI
	initialize a new project for you.


## Serve static content

After initializing Firebase, you can serve static content with the standard
deployment command:

```shell
firebase deploy
```

You can [view your deployed app](https://firebase.google.com/docs/hosting/test-preview-deploy#view-changes)
on its live site.
