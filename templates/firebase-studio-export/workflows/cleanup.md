---
name: Cleanup
description: Run initial checks and clean up dead files.
---

# Step 1: Check Compilation

Run \`npm run build\` (depending on the app type) to ensure the project is in a healthy state.

# Step 2: Cleanup Genkit config

Check to see if genkit is otherwise unused in this project, ask the user if they'd like to remove the configuration in src/ai/genkit.ts and remove related dependencies in package.json.

# Step 3: Cleanup dev.nix

Ask the developer if they'd like to remove the .idx/dev.nix file. Most times this file will be unused but the developer may have added some configurations that they'd like to keep.

# Step 4: Cleanup GEMINI.md

Check for the existence of GEMINI.md. The GEMINI.md (if it exists) was written for a Firebase Studio context. Much of this information is no longer relevant. Ask the user if they'd like you to update the contents or remove the file entirely so they can start with a fresh GEMINI.md.
