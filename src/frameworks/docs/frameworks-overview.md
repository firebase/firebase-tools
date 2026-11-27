# Integrate web frameworks with Hosting

Firebase Hosting integrates with popular modern web frameworks including Angular
and Next.js. Using Firebase Hosting and Cloud Functions for Firebase with these
frameworks, you can develop apps and microservices in your preferred framework
environment, and then deploy them in a managed, secure server environment.

Support during this early preview includes the following functionality:

* Deploy Web apps comprised of static web content
* Deploy Web apps that use pre-rendering / Static Site Generation (SSG)
* Deploy Web apps that use server-side Rendering (SSR)—full server rendering on demand

Firebase provides this functionality through the Firebase CLI. When initializing
Hosting on the command line, you provide information about your new or existing
Web project, and the CLI sets up the right resources for your chosen Web
framework.

Note: Framework-aware Hosting is an early public preview. This means
that the functionality might change in backward-incompatible ways. A preview
release is not subject to any SLA or deprecation policy and may receive limited
or no support.

## Serve locally

You can test your integration locally by following these steps:

1. Run `firebase emulators:start` from the terminal. This builds your app and
   serves it using the Firebase CLI.
2. Open your web app at the local URL returned by the CLI (usually http://localhost:5000).

## Deploy your app to Firebase Hosting

When you're ready to share your changes with the world, deploy your app to your
live site:

1. Run `firebase deploy` from the terminal.
2. Check your website on: `SITE_ID.web.app` or `PROJECT_ID.web.app` (or your custom domain, if you set one up).

## Configure different environments

You can deploy multiple sets of environment variables for different project environments, such as staging and production.

Like Cloud Functions for Firebase, this tooling supports the [dotenv](https://www.npmjs.com/package/dotenv)  file format for loading environment variables specified in a .env file.

* If you have a `staging` project alias, you can deploy environment variables from a `.env.staging` file.
* If you have a `production` project alias, you can deploy environment variables from a `.env.production` file.
* If you have a project with id `PROJECT_ID`, you can deploy environment variables from a `.env.PROJECT_ID` file.

See the [Cloud Functions documentation](https://firebase.google.com/docs/functions/config-env?gen=2nd#deploying_multiple_sets_of_environment_variables) for a detailed guide.

## Next steps

See the detailed guide for your preferred framework:

* [Angular](https://firebase.google.com/docs/hosting/frameworks/angular)
* [Next.js](https://firebase.google.com/docs/hosting/frameworks/nextjs)
* [Flutter Web](https://firebase.google.com/docs/hosting/frameworks/flutter)
* [Frameworks with Express.js](https://firebase.google.com/docs/hosting/frameworks/express)
