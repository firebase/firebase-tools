---
name: Initial Project Setup
description: Run initial checks and fix common migration issues
---

# Step 1: Check Compilation

Run \`npm run typecheck\` and \`npm run build\` to ensure the project is in a healthy state.

# Step 2: Verify Firebase Auth/Firestore

If the app uses Firebase services, ensure the environment variables are correctly set or provided via App Hosting.

# Step 3: Cleanup Genkit config

If genkit is otherwise unused in this project, remove the configuration in src/ai/genkit.ts and remove related dependencies in package.json.
