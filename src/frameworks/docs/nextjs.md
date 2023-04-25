Project: /docs/hosting/_project.yaml
Book: /docs/_book.yaml
page_type: guide

{% include "_shared/apis/console/_local_variables.html" %}
{% include "_local_variables.html" %}
{% include "docs/hosting/_local_variables.html" %}

<link rel="stylesheet" type="text/css" href="/styles/docs.css" />

# Integrate Next.js

Using the {{firebase_cli}}, you can deploy your Next.js Web apps to Firebase and
serve them with {{firebase_hosting}}. The {{cli}} respects your Next.js settings and
translates them to Firebase settings with zero or minimal extra configuration on
your part. If your app includes dynamic server-side logic, the {{cli}} deploys that
logic to {{cloud_functions_full}}.

<<_includes/_preview-disclaimer.md>>

<<_includes/_before-you-begin.md>>

- Optional: Billing enabled on your Firebase project
  (required if you plan to use SSR)
- Optional: use the experimental ReactFire library to benefit from its
  Firebase-friendly features

<<_includes/_initialize-firebase.md>>

1.  Choose your hosting source directory. If this an existing Next.js app,
    the {{cli}} process completes, and you can proceed to the next section.
1.  Choose "Dynamic web hosting with web framework"
1.  Choose Next.js.

## Serve static content

After initializing Firebase, you can serve static content with the standard
deployment command:

```shell
firebase deploy
```

You can [view your deployed app](/docs/hosting/test-preview-deploy#view-changes)
on its live site.

## Pre-render dynamic content

The {{firebase_cli}} will detect usage of
[getStaticProps](https://nextjs.org/docs/basic-features/data-fetching/get-
static-props) and [getStaticPaths](https://nextjs.org/docs/basic-features/data-
fetching/get-static-paths).

### Optional: integrate with the Firebase JS SDK

When including Firebase JS SDK methods in both server and client bundles, guard
against runtime errors by checking `isSupported()` before using the product.
Not all products are [supported in all environments](/docs/web/environments-js-sdk#other_environments).

Tip: consider using
[ReactFire](https://github.com/FirebaseExtended/reactfire#reactfire), which does
this for you automatically.

### Optional: integrate with the Firebase Admin SDK

Admin SDK bundles will fail if included in your browser build; refer to them
only inside [getStaticProps](https://nextjs.org/docs/basic-features/data-fetching/get-static-props)
and [getStaticPaths](https://nextjs.org/docs/basic-features/data-fetching/get-static-paths).

## Serve fully dynamic content (SSR)

The {{firebase_cli}} will detect usage of
[getServerSideProps](https://nextjs.org/docs/basic-features/data-fetching/get-server-side-props).

## Configure {{hosting}} behavior with `next.config.js`

### Image Optimization

Using [Next.js Image Optimization](https://nextjs.org/docs/basic-features/image-optimization)
is supported, but it will trigger creation of a function
(in [{{cloud_functions_full}}](/docs/functions/)), even if you’re not using SSR.

Note: Because of this, image optimization and {{hosting}} preview channels don’t
interoperate well together.

### Redirects, Rewrites, and Headers

The {{firebase_cli}} respects [redirects](https://nextjs.org/docs/api-reference/next.config.js/redirects),
[rewrites](https://nextjs.org/docs/api-reference/next.config.js/rewrites), and
[headers](https://nextjs.org/docs/api-reference/next.config.js/headers) in
`next.config.js`, converting them to their
respective equivalent {{firebase_hosting}} configuration at deploy time. If a
Next.js redirect, rewrite, or header cannot be converted to an equivalent
{{firebase_hosting}} header, it falls back and builds a function—even if you
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
