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

Caution: For SvelteKit developers, new participation in the Hosting
frameworks experiment has been closed permanently. If you're already using the
frameworks experiment in the Firebase CLI, we recommend "graduating" to
App Hosting. With App Hosting, you'll have a unified solution to manage
everything from CDN to server-side rendering, along with improved GitHub
integration.


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