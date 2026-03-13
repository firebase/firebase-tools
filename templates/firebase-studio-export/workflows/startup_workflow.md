---
name: Initial Project Setup
description: Run initial checks and fix common migration issues
---

# Step 1: Check Compilation

Run \`npm run typecheck\` and \`npm run build\` (depending on the app type) to ensure the project is in a healthy state.

# Step 2: Cleanup Genkit config

If genkit is otherwise unused in this project, ask the user if they'd like to remove the configuration in src/ai/genkit.ts and remove related dependencies in package.json.
