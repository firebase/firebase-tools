Project: /docs/hosting/_project.yaml
Book: /docs/_book.yaml
page_type: guide

{% include "_shared/apis/console/_local_variables.html" %}
{% include "_local_variables.html" %}
{% include "docs/hosting/_local_variables.html" %}

<link rel="stylesheet" type="text/css" href="/styles/docs.css" />

# Integrate Angular

With the Firebase framework-aware {{cli}}, you can deploy your Angular application
to Firebase and serve dynamic content to your users.

<<_includes/_preview-disclaimer.md>>

<<_includes/_before-you-begin.md>>

- Optional: AngularFire

<<_includes/_initialize-firebase.md>>

1. Answer yes to "Do you want to use a web framework? (experimental)"
1. Choose your hosting source directory; this could be an existing Angular app.
1. If prompted, choose Angular.

### Initialize an existing project

Change your hosting config in `firebase.json` to have a `source` option, rather
than a `public` option. For example:

```json
{
  "hosting": {
    "source": "./path-to-your-angular-workspace"
  }
}
```

## Serve static content

After initializing Firebase, you can serve static content with the standard
deployment command:

```shell
firebase deploy
```

## Pre-render dynamic content

To prerender dynamic content in Angular, you need to set up Angular SSR.

```shell
ng add @angular/ssr
```

See the [Angular Prerendering (SSG) guide](https://angular.dev/guide/prerendering)
for more information.

#### Deploy

When you deploy with `firebase deploy`, Firebase builds your browser bundle,
your server bundle, and prerenders the application. These elements are deployed
to {{hosting}} and {{cloud_functions_full}}.

#### Custom deploy

The {{firebase_cli}} assumes that you have a single application defined in your
`angular.json` with a production build configuration.

If need to tailor the {{cli}}'s assumptions, you can either use the
`FIREBASE_FRAMEWORKS_BUILD_TARGET` environment variable or add
[AngularFire](https://github.com/angular/angularfire#readme) and modify your
`angular.json`:

```json
{
  "deploy": {
    "builder": "@angular/fire:deploy",
    "options": {
      "version": 2,
      "buildTarget": "OVERRIDE_YOUR_BUILD_TARGET"
    }
  }
}
```

### Optional: integrate with the Firebase JS SDK

When including Firebase JS SDK methods in both server and client bundles, guard
against runtime errors by checking `isSupported()` before using the product.
Not all products are [supported in all environments](/docs/web/environments-js-sdk#other_environments).

Tip: consider using [AngularFire](https://github.com/angular/angularfire#readme),
which does this for you automatically.

### Optional: integrate with the Firebase Admin SDK

Admin bundles will fail if they are included in your browser build, so consider
providing them in your server module and injecting as an optional dependency:

```typescript
// your-component.ts
import type { app } from 'firebase-admin';
import { FIREBASE_ADMIN } from '../app.module';

@Component({...})
export class YourComponent {

  constructor(@Optional() @Inject(FIREBASE_ADMIN) admin: app.App) {
    ...
  }
}

// app.server.module.ts
import * as admin from 'firebase-admin';
import { FIREBASE_ADMIN } from './app.module';

@NgModule({
  …
  providers: [
    …
    { provide: FIREBASE_ADMIN, useFactory: () => admin.apps[0] || admin.initializeApp() }
  ],
})
export class AppServerModule {}

// app.module.ts
import type { app } from 'firebase-admin';

export const FIREBASE_ADMIN = new InjectionToken<app.App>('firebase-admin');
```

## Serve fully dynamic content with SSR

### Optional: integrate with Firebase Authentication

The web framework-aware Firebase deployment tooling automatically keeps client
and server state in sync using cookies. The Express `res.locals` object will
optionally contain an authenticated Firebase App instance (`firebaseApp`) and
the currently signed in user (`currentUser`). This can be injected into your
module via the REQUEST token (exported from @nguniversal/express-engine/tokens).
