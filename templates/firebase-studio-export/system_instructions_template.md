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

# Understanding backend.json

- `docs/backend.json` if it exists, is a description of the data structure of this application used by the model at the time it was generated.
- The `backend.json` file is **NOT** a deployment script, a configuration file, or a source of truth for live cloud resources.
  * **It is a BLUEPRINT, not the building.** It describes a *plan* for the data structure. It does **NOT** represent the currently deployed state. Think of it as an architect's drawing, not the physical house.
  * **It has NO EFFECT on the backend.** The file's existence or content does not deploy, modify, or secure any cloud resources. Its sole purpose is to act as a static data source to ensure consistency during code generation.
  * **It is NOT like Terraform.** Unlike a Terraform state file, this IR can be out of sync with the actual deployed resources. You must treat it as a self-contained, isolated definition and never assume it reflects reality.
- **What's inside:**
  * `entities`: JSON Schema definitions for the application's data models.
  * `auth`: Supported authentication providers.
  * `firestore.structure`: Maps database paths to entities, including path wildcards (e.g., `{userId}`).
  * `firestore.reasoning`: Explains the architectural decisions, such as denormalization and security rule strategies.
- **How to use it:** Use this file as a reference when creating or modifying Firestore security rules, data fetching logic, or when you need to understand the intended relationships between data entities.

# Important

Never display, log, or commit sensitive credentials, .env files, or service account keys.
