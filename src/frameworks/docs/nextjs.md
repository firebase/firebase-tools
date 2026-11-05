# Integrate Next.js

Using the Firebase CLI, you can deploy your Next.js Web apps to Firebase and
serve them with Firebase Hosting.

Note: Framework-aware Hosting is an early public preview. This means
that the functionality might change in backward-incompatible ways. A preview
release is not subject to any SLA or deprecation policy and may receive limited
or no support.

Caution: For Next.js developers, new participation in the Hosting
frameworks experiment has been closed permanently. If you're already using the
frameworks experiment in the Firebase CLI, we recommend "graduating" to
App Hosting. With App Hosting, you'll have a unified solution to manage
everything from CDN to server-side rendering, along with improved GitHub
integration.

## Serve static content

After initializing Firebase, you can serve static content with the standard
deployment command:

```shell
firebase deploy
```

If your app includes dynamic server-side logic, the CLI deploys that
logic to Cloud Functions for Firebase.
You can [view your deployed app](https://firebase.google.com/docs/hosting/test-preview-deploy#view-changes)
on its live site.

## Pre-render dynamic content

The Firebase CLI will detect usage of
[getStaticProps](https://nextjs.org/docs/pages/building-your-application/data-fetching/get-static-props)
and [getStaticPaths](https://nextjs.org/docs/pages/building-your-application/data-fetching/get-static-paths).

### Optional: integrate with the Firebase JS SDK

When including Firebase JS SDK methods in both server and client bundles, guard
against runtime errors by checking `isSupported()` before using the product.
Not all products are
[supported in all environments](https://firebase.google.com/docs/web/environments-js-sdk#other_environments).

Tip: consider using
[ReactFire](https://github.com/FirebaseExtended/reactfire#reactfire), which does
this for you automatically.

### Optional: integrate with the Firebase Admin SDK

Admin SDK bundles will fail if included in your browser build; refer to them
only inside [getStaticProps](https://nextjs.org/docs/basic-features/data-fetching/get-static-props)
and [getStaticPaths](https://nextjs.org/docs/basic-features/data-fetching/get-static-paths).

## Serve fully dynamic content (SSR)

The Firebase CLI will detect usage of
[getServerSideProps](https://nextjs.org/docs/basic-features/data-fetching/get-server-side-props).
In such cases, the CLI will deploy functions to Cloud Functions for Firebase to run dynamic
server code. You can view information about these functions, such as their domain and runtime
configuration, in the [Firebase console](https://console.firebase.google.com/project/_/functions).


## Configure Hosting behavior with `next.config.js`

### Image Optimization

Using [Next.js Image Optimization](https://nextjs.org/docs/basic-features/image-optimization)
is supported, but it will trigger creation of a function
(in [Cloud Functions for Firebase](https://firebase.google.com/docs/functions/)), even if you’re not using SSR.

Note: Because of this, image optimization and Hosting preview channels don’t
interoperate well together.

### Redirects, Rewrites, and Headers

The Firebase CLI respects
[redirects](https://nextjs.org/docs/api-reference/next.config.js/redirects),
[rewrites](https://nextjs.org/docs/api-reference/next.config.js/rewrites), and
[headers](https://nextjs.org/docs/api-reference/next.config.js/headers) in
`next.config.js`, converting them to their
respective equivalent Firebase Hosting configuration at deploy time. If a
Next.js redirect, rewrite, or header cannot be converted to an equivalent
Firebase Hosting header, it falls back and builds a function—even if you
aren’t using image optimization or SSR.

### Optional: integrate with Firebase Authentication

The web framework-aware Firebase deployment tooling will automatically keep
client and server state in sync using cookies. There are some methods provided
for accessing the authentication context in SSR:

- The Express `res.locals` object will optionally contain an authenticated
  Firebase App instance (`firebaseApp`) and the currently signed-in user
  (`currentUser`). This can be accessed in `getServerSideProps`.
- The authenticated Firebase App name is provided on the route query
  (`__firebaseAppName`). This allows for manual integration while in context:

```typescript
// get the authenticated Firebase App
const firebaseApp = getApp(useRouter().query.__firebaseAppName);
```
