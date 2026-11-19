# Integrate Flutter Web

With the Firebase framework-aware CLI, you can deploy your Flutter application
to Firebase.

Note: Framework-aware Hosting is an early public preview. This means
that the functionality might change in backward-incompatible ways. A preview
release is not subject to any SLA or deprecation policy and may receive limited
or no support.

## Before you begin

Before you get started deploying your app to Firebase,
review the following requirements and options:

- Firebase CLI version 12.1.0 or later. Make sure to
  [install the CLI](https://firebase.google.com/docs/cli#setup_update_cli)
  using your preferred method.
- Optional: Billing enabled on your Firebase project
  (required if you plan to use SSR)

## Initialize Firebase

To get started, initialize Firebase for your framework project.
Modify `firebase.json` for an existing project.

### Initialize an existing project

Change your hosting config in `firebase.json` to have a `source` option, rather
than a `public` option. For example:

```json
{
  "hosting": {
    "source": "./path-to-your-flutter-app"
  }
}
```

## Serve static content

After initializing Firebase, you can serve static content with the standard
deployment command:

```shell
firebase deploy
```
