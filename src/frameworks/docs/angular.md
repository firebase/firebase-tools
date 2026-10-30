# Integrate Angular

Note: Framework-aware Hosting is an early public preview. This means
that the functionality might change in backward-incompatible ways. A preview
release is not subject to any SLA or deprecation policy and may receive limited
or no support.

Caution: For Angular developers, new participation in the Hosting
frameworks experiment has been closed permanently. If you're already using the
frameworks experiment in the Firebase CLI, we recommend "graduating" to
App Hosting. With App Hosting, you'll have a unified solution to manage
everything from CDN to server-side rendering, along with improved GitHub
integration.

## Serve static content

You can serve static content with the standard deployment command:

```shell
firebase deploy
```

## Pre-render dynamic content

To prerender dynamic content in Angular, you need to set up Angular SSR.

```shell
ng add @angular/ssr
```

See the [Angular Prerendering (SSG) guide](https://angular.dev/guide/ssr)
for more information.

### Optional: add a server module

#### Deploy

When you deploy with `firebase deploy`, Firebase builds your browser bundle,
your server bundle, and prerenders the application. These elements are deployed
to Hosting and Cloud Functions for Firebase.

#### Custom deploy

The Firebase CLI assumes that you have a single application defined in your
`angular.json` with a production build configuration.

If you need to tailor the CLI's assumptions, you can either use the
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
Not all products are [supported in all environments](https://firebase.google.com/docs/web/environments-js-sdk#other_environments).

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
