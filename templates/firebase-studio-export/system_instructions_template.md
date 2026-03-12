---
trigger: always_on
---

# Project Context

This project was migrated from Firebase Studio.
App Name: ${appName}

# Migration Guidelines

- `docs/blueprint.md` describes what this app was supposed to do when it was exported. Read it before making changes to the app.

- Use Agent Skills to guide Firebase usage. If they are not available, install them by running `npx -y skills add  firebase/agent-skills --skill "*" -y`

- When asked to deploy or publish the app, deploy to Firebase App Hosting using `firebase deploy`.
If you run into issues, ensure `firebase.json` contains a valid `apphosting` block (with `backendId` and `rootDir`).
DO NOT use `firebase apphosting:backends:create` or `firebase apphosting:rollouts:create`.
DO NOT try to deploy to Firebase Hosting.

- When asked to add AI features, use Genkit (as already configured in `src/ai/`).

# Important

Never display, log, or commit sensitive credentials, .env files, or service account keys.
