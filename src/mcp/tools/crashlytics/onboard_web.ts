import { z } from "zod";
import { AppPlatform, getAppConfig, listFirebaseApps } from "../../../management/apps";
import { logger } from "../../../logger";
import { tool } from "../../tool";
import { toContent } from "../../util";

const PLACEHOLDER_PROJECT_ID = "<YOUR_FIREBASE_PROJECT_ID>";
const PLACEHOLDER_APP_ID = "<YOUR_FIREBASE_APP_ID>";
const PLACEHOLDER_API_KEY = "<YOUR_FIREBASE_API_KEY>";
const PLACEHOLDER_AUTH_DOMAIN = "<YOUR_AUTH_DOMAIN>";
const PLACEHOLDER_STORAGE_BUCKET = "<YOUR_STORAGE_BUCKET>";
const PLACEHOLDER_MESSAGING_SENDER_ID = "<YOUR_MESSAGING_SENDER_ID>";

export const SUPPORTED_FRAMEWORKS = [
  "nextjs",
  "react",
  "react-router",
  "tanstack",
  "angular",
] as const;
export type SupportedFramework = (typeof SUPPORTED_FRAMEWORKS)[number];

const FrameworkSchema = z
  .enum(SUPPORTED_FRAMEWORKS)
  .optional()
  .describe(
    "The web framework used ('nextjs', 'react', 'react-router', 'tanstack', or 'angular'). If provided, framework-specific code snippets and instructions are returned.",
  );

interface FirebaseConfigTemplate {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const FRAMEWORK_GUIDES: Readonly<Record<SupportedFramework, string>> = {
  nextjs: `### Next.js Setup Guide

#### Option A: Next.js 15.3+ (Recommended: Client Instrumentation)
Next.js 15.3+ supports client instrumentation via \`instrumentation-client.ts\` (or \`.js\`). This runs in the browser before React hydration begins and automatically registers global error listeners.

Create \`src/instrumentation-client.ts\` (or in project root if not using a \`src/\` directory):
\`\`\`typescript
import { getCrashlytics } from 'firebase/crashlytics';
import { app } from './lib/firebase'; // Shared initialization script

getCrashlytics(app);
\`\`\`

#### Option B: Next.js < 15.3 (Client Component Wrapper)
For Next.js versions earlier than 15.3, \`layout.tsx\` is a Server Component. Create a Client Component (e.g., \`src/components/CrashlyticsProvider.tsx\`):
\`\`\`tsx
'use client';

import React from 'react';
import { FirebaseCrashlytics } from 'firebase/crashlytics/react';
import { app } from '../lib/firebase'; // Shared initialization script

export function CrashlyticsProvider({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseCrashlytics firebaseApp={app}>
      {children}
    </FirebaseCrashlytics>
  );
}
\`\`\`

Then wrap your application tree in \`src/app/layout.tsx\`:
\`\`\`tsx
import { CrashlyticsProvider } from '../components/CrashlyticsProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CrashlyticsProvider>
          {children}
        </CrashlyticsProvider>
      </body>
    </html>
  );
}
\`\`\``,

  react: `### React Setup Guide (without React Router)

Wrap your root application component (typically \`src/App.tsx\` or \`src/main.tsx\`) with \`<FirebaseCrashlytics>\`. It acts as the global window receiver, handling unhandled rejections and browser exceptions:

\`\`\`tsx
import React from 'react';
import { FirebaseCrashlytics } from 'firebase/crashlytics/react';
import { app } from './lib/firebase'; // Shared initialization script

export default function App() {
  return (
    <FirebaseCrashlytics firebaseApp={app}>
      {/* Rest of your application components */}
    </FirebaseCrashlytics>
  );
}
\`\`\`

> **Note**: If you use custom error boundaries in your application, you can also record caught errors manually via \`recordError(getCrashlytics(app), error)\`.`,

  "react-router": `### React Router (v6+) Setup Guide

If your application uses React Router (v6+), replace React Router's \`<Routes>\` component with \`<CrashlyticsRoutes>\`. This handles uncaught errors across routes and tracks errors using parameterized templates (e.g., \`/profile/:userId\`):

\`\`\`tsx
import React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { CrashlyticsRoutes } from 'firebase/crashlytics/react-router';
import { app } from './lib/firebase'; // Shared initialization script
import Home from './pages/Home';
import Profile from './pages/Profile';

export default function App() {
  return (
    <BrowserRouter>
      <CrashlyticsRoutes firebaseApp={app}>
        <Route path="/" element={<Home />} />
        <Route path="/profile/:userId" element={<Profile />} />
      </CrashlyticsRoutes>
    </BrowserRouter>
  );
}
\`\`\``,

  tanstack: `### TanStack Router Setup Guide

Initialize Crashlytics with \`getCrashlytics(app)\` and pass errors from \`defaultOnCatch\` to \`recordError\`:

\`\`\`typescript
import { recordError, getCrashlytics } from 'firebase/crashlytics';
import { app } from './lib/firebase'; // Shared initialization script
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

const crashlytics = getCrashlytics(app);

const router = createRouter({
  routeTree,
  defaultOnCatch: (error, errorInfo) => {
    recordError(crashlytics, error, errorInfo);
  },
});
\`\`\`

> **Tip**: Calling \`getCrashlytics(app)\` automatically registers global listeners for uncaught window errors and unhandled promise rejections, while \`defaultOnCatch\` captures errors caught during routing and rendering.`,

  angular: `### Angular Setup Guide

Integrate with Angular's global error-catching runtime and route tracking by adding \`provideCrashlytics(() => app)\` to your application's providers in \`src/app/app.config.ts\`:

\`\`\`typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideCrashlytics } from 'firebase/crashlytics/angular';
import { app } from '../lib/firebase'; // Shared initialization script
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideCrashlytics(() => app),
  ],
};
\`\`\`

> \`provideCrashlytics()\` registers a custom \`ErrorHandler\` to track uncaught zone crashes and uses internal \`Router\` instances to build dynamic routes rather than logging literal URLs.`,
};

function getFrameworkSection(framework?: SupportedFramework): string {
  if (framework && framework in FRAMEWORK_GUIDES) {
    return FRAMEWORK_GUIDES[framework];
  }

  return SUPPORTED_FRAMEWORKS.map((fw) => FRAMEWORK_GUIDES[fw]).join("\n\n---\n\n");
}

async function resolveWebConfig(
  appIdInput: string | undefined,
  projectId: string | undefined,
): Promise<{ config: FirebaseConfigTemplate; detectedAppId: string; detectedAppsNote?: string }> {
  let resolvedAppId = appIdInput;
  let detectedAppsNote: string | undefined;

  const effectiveProjectId = projectId || PLACEHOLDER_PROJECT_ID;

  if (!resolvedAppId && projectId) {
    try {
      const apps = await listFirebaseApps(projectId, AppPlatform.WEB);
      if (apps.length === 1) {
        resolvedAppId = apps[0].appId;
      } else if (apps.length > 1) {
        resolvedAppId = apps[0].appId;
        detectedAppsNote = `Multiple web apps found in project '${projectId}'. Defaulting to ${resolvedAppId} (${apps[0].displayName || "unnamed"}). Other detected web apps: ${apps
          .slice(1)
          .map((a) => `${a.appId} (${a.displayName || "unnamed"})`)
          .join(", ")}.`;
      }
    } catch (err) {
      logger.debug("Failed to list web apps for project:", err);
    }
  }

  const finalAppId = resolvedAppId || PLACEHOLDER_APP_ID;

  if (resolvedAppId && resolvedAppId !== PLACEHOLDER_APP_ID) {
    try {
      const sdkConfig = await getAppConfig(resolvedAppId, AppPlatform.WEB);
      if ("apiKey" in sdkConfig) {
        const resolvedProjectId = sdkConfig.projectId || projectId || PLACEHOLDER_PROJECT_ID;
        return {
          config: {
            apiKey: sdkConfig.apiKey || PLACEHOLDER_API_KEY,
            authDomain: sdkConfig.authDomain || (resolvedProjectId !== PLACEHOLDER_PROJECT_ID ? `${resolvedProjectId}.firebaseapp.com` : PLACEHOLDER_AUTH_DOMAIN),
            projectId: resolvedProjectId,
            storageBucket: sdkConfig.storageBucket || (resolvedProjectId !== PLACEHOLDER_PROJECT_ID ? `${resolvedProjectId}.firebasestorage.app` : PLACEHOLDER_STORAGE_BUCKET),
            messagingSenderId: sdkConfig.messagingSenderId || PLACEHOLDER_MESSAGING_SENDER_ID,
            appId: sdkConfig.appId || resolvedAppId,
          },
          detectedAppId: finalAppId,
          detectedAppsNote,
        };
      }
    } catch (err) {
      logger.debug("Failed to get app config:", err);
    }
  }

  return {
    config: {
      apiKey: PLACEHOLDER_API_KEY,
      authDomain:
        effectiveProjectId !== PLACEHOLDER_PROJECT_ID
          ? `${effectiveProjectId}.firebaseapp.com`
          : PLACEHOLDER_AUTH_DOMAIN,
      projectId: effectiveProjectId,
      storageBucket:
        effectiveProjectId !== PLACEHOLDER_PROJECT_ID
          ? `${effectiveProjectId}.firebasestorage.app`
          : PLACEHOLDER_STORAGE_BUCKET,
      messagingSenderId: PLACEHOLDER_MESSAGING_SENDER_ID,
      appId: finalAppId,
    },
    detectedAppId: finalAppId,
    detectedAppsNote,
  };
}

export const onboard_web = tool(
  "crashlytics",
  {
    name: "onboard_web",
    description:
      "Provides onboarding instructions and setup guides for integrating Firebase Crashlytics into web applications (Next.js, React, React Router, TanStack Router, Angular). Includes Cloud project setup, API enablement, logging buckets and sinks, SDK initialization, framework-specific code snippets, sourcemap uploads, and test crash verification.",
    humanReadableDescription:
      "Provide onboarding instructions and setup guides for integrating Firebase Crashlytics into web applications.",
    inputSchema: z.object({
      appId: z
        .string()
        .optional()
        .describe(
          "Firebase Web App ID (e.g. '1:1234567890:web:abcdef1234567890'). If omitted, the tool will attempt to detect it from the active project.",
        ),
      framework: FrameworkSchema,
    }),
    annotations: {
      title: "Onboard Crashlytics for Web",
      readOnlyHint: true,
      idempotentHint: true,
    },
    _meta: {
      requiresProject: false,
      requiresAuth: false,
    },
    isAvailable: async () => true,
  },
  async ({ appId: appIdInput, framework }, ctx) => {
    const { config, detectedAppId, detectedAppsNote } = await resolveWebConfig(
      appIdInput,
      ctx.projectId,
    );
    const effectiveProjectId = ctx.projectId || PLACEHOLDER_PROJECT_ID;
    const frameworkSection = getFrameworkSection(framework);

    const noteSection = detectedAppsNote ? `\n> **Note**: ${detectedAppsNote}\n` : "";

    const content = `# Firebase Crashlytics for Web Apps - Onboarding Guide

> [!IMPORTANT]
Crashlytics for Web Apps supports client-side error reporting, de-minified stack traces, and a dedicated dashboard in the Firebase Crashlytics Console for **Next.js, React, Angular, React Router, and TanStack Router**.

Crashlytics for web apps uses Cloud Logging for telemetry storage and Cloud Storage for sourcemap storage under the hood.
${noteSection}
---

## Step 1: Configure Firebase / Cloud Project

### Option 1: Using Firebase Console (Recommended)
1. Navigate to the [Firebase Console Crashlytics page](https://console.firebase.google.com/u/0/project/_/crashlytics).
2. Select your project: \`${effectiveProjectId}\`.
3. Click **Set up** and follow the steps in the console.

### Option 2: Using Firebase CLI
Run the onboarding commands to enable experiments and onboard:
\`\`\`bash
firebase crashlytics:onboard:web ${detectedAppId} --project ${effectiveProjectId}
\`\`\`
> **Prerequisites**: Requires Firebase CLI v15.19.1+, Owner/Editor project permissions, and Blaze billing enabled.

---

## Step 2: Core SDK Installation & Initialization

### 1. Install Packages
Install the core Firebase package:
\`\`\`bash
npm install firebase
\`\`\`

### 2. Initialize Firebase App Singleton
Create a central configuration file (\`src/lib/firebase.ts\`):
\`\`\`typescript
// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "${config.apiKey}",
  authDomain: "${config.authDomain}",
  projectId: "${config.projectId}",
  storageBucket: "${config.storageBucket}",
  messagingSenderId: "${config.messagingSenderId}",
  appId: "${config.appId}"
};

// Guarantee singleton initialization
export const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();
\`\`\`

---

## Step 3: Framework-Specific Setup Guide

${frameworkSection}

---

## Step 4: Force an Initial Crash

To verify that crashes are properly delivered to Firebase Crashlytics, add a test error inside a user interaction handler (such as a button click):

\`\`\`typescript
throw new Error("Test Crash");
\`\`\`

1. Run your web application and trigger the crash by clicking the button.
2. Open the [Firebase Console Crashlytics dashboard](https://console.firebase.google.com/u/0/project/_/crashlytics).
3. Select project \`${effectiveProjectId}\` to view the newly logged crash report (note: reports may take 1-3 minutes to appear).

---

## Step 5: Source Map Uploading (Stack Trace De-obfuscation)

Upload your build source maps so Crashlytics displays original filenames, functions, and line numbers:

\`\`\`bash
firebase crashlytics:sourcemap:upload [buildOutputFolder] --app ${detectedAppId} --project ${effectiveProjectId}
\`\`\`

Provide the \`--clean\` flag to delete local source maps after uploading.

---

## Additional Configuration

- **Force 100% Sampling for Debugging**: Set \`self.FIREBASE_TELEMETRY_DEBUG = true;\` in browser code or DevTools console to force 100% telemetry collection for the current session.
- **Session Sampling Rate**: Configure session sampling (0% to 100%) in the Firebase Console (**Configure sampling**) or via the Firebase Telemetry Admin API.
- **Alerting**: Configure email alerts for new and regressed issues in Firebase Console under **Project Settings > Alerts**.
`;

    return toContent(content);
  },
);
