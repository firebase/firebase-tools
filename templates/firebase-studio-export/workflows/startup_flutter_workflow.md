---
name: Initial Project Setup
description: Run initial checks and fix common migration issues
---

# Step 1: Check Compilation

Run \`flutter pub get\` and \`flutter analyze\` to ensure the project is in a healthy state.

# Step 2: Verify Firebase Auth/Firestore

If the app uses Firebase services, ensure the \`firebase_core\` package is initialized and proper configuration is provided for each platform.

# Step 3: Run the App

Try running the app on your preferred platform using \`flutter run\`.
