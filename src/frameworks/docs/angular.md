Project: /docs/hosting/_project.yaml
Book: /docs/_book.yaml
page_type: guide

{% include "_shared/apis/console/_local_variables.html" %}
{% include "_local_variables.html" %}
{% include "docs/hosting/_local_variables.html" %}

<link rel="stylesheet" type="text/css" href="/styles/docs.css" />

# Integrate Angular Universal

With the Firebase framework-aware {{cli}}, you can deploy your Angular application
to Firebase and serve dynamic content to your users.

<<_includes/_preview-disclaimer.md>>

<<_includes/_before-you-begin.md>>

- Optional: AngularFire

<<_includes/_initialize-firebase.md>>

1. Choose your hosting source directory; this could be an existing Angular app.
1. Choose "Dynamic web hosting with web framework."
1. Choose Angular.

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

To prerender dynamic content in Angular, you need to set up Angular Universal.
The {{firebase_cli}} expects Express Engine:

```shell
ng add @nguniversal/express-engine
```

See the [Angular Universal guide](https://angular.io/guide/universal)
for more information.

### Add prerender URLs

By default, only the root directory will be prerendered. You can add additional
routes by locating the prerender step in `angular.json` and adding more routes:

```json
{
  "prerender": {
    "builder": "@nguniversal/builders:prerender",
    "options": {
      "routes": ["/", "ANOTHER_ROUTE", "AND_ANOTHER"]
    },
    "configurations": {
      /* ... */
    },
    "defaultConfiguration": "production"
  }
}
```

Firebase also respects `guessRoutes` or a `routes.txt` file in the hosting root,
if you need to customize further. See [Angular’s prerendering
guide](https://angular.io/guide/prerendering) for more information on those
options.

### Optional: add a server module

#### Deploy

When you deploy with `firebase deploy`, Firebase builds your browser bundle,
your server bundle, and prerenders the application. These elements are deployed
to {{hosting}} and {{cloud_functions_full}}.

#### Custom deploy

The {{firebase_cli}} assumes that you have server, build, and prerender steps in
your schematics with a production configuration.

If you want to tailor the {{cli}}'s assumptions, configure `ng deploy` and edit the
configuration in `angular.json`. For example, you could disable SSR and serve
pre-rendered content exclusively by removing `serverTarget`:

```json
{
  "deploy": {
    "builder": "@angular/fire:deploy",
    "options": {
      "browserTarget": "app:build:production",
      "serverTarget": "app:server:production",
      "prerenderTarget": "app:prerender:production"
    }
  }
}
```

### Optional: integrate with the Firebase JS SDK

When including Firebase JS SDK methods in both server and client bundles, guard
against runtime errors by checking `isSupported()` before using the product.
Not all products are [supported in all environments](/docs/web/environments-js-sdk#other_environments).

Tip: consider using AngularFire, which does this for you automatically.

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
