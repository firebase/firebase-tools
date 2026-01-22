---
name: "firebase"
displayName: "Build with Firebase"
description: "Build full-stack applications with Firebase's suite of backend services including Authentication, Firestore, App Hosting, Cloud Functions, Storage, Crashlytics, and Cloud Messaging"
keywords: ["firebase", "firestore", "auth", "authentication", "database", "realtime", "cloud functions", "storage", "hosting", "app hosting", "backend", "cloud messaging", "fcm", "nosql", "serverless", "baas", "crashlytics"]
mcpServers: ["firebase"]
---

# Onboarding

## Validate Firebase CLI Installation

Before using the Firebase MCP server, ensure Node.js and the Firebase CLI are installed and you're authenticated:

- **Node.js**: Required to run the Firebase CLI
  - Check installation: `node --version`
  - Install if needed: Download from [nodejs.org](https://nodejs.org/) (LTS version recommended)

- **Firebase CLI**: Required for managing Firebase projects and services
  - Check installation: `firebase --version`
  - Install if needed: `npm install -g firebase-tools`
  - **CRITICAL**: If the Firebase CLI is not installed, DO NOT proceed with Firebase setup.
  
- **Authentication**: Sign in to Firebase
  - Check current user: `firebase login:list`
  - If not signed in, run: `firebase login` (this will open a browser for Google Account authentication)

- **Check Projects**: Verify project access and connectivity
  - Run `firebase projects:list` to check for available Firebase projects
  - Use this to verify that the CLI is correctly authenticated and can reach the Firebase API; if this fails, try to reconnect using `firebase login`

- **Verify MCP Connection**: Ensure the MCP server is connected after authentication
  - Use the `firebase_get_environment` tool to check connection status
  - Verify it returns the correct current user and project information
  - **If connection fails**: The MCP server may need manual setup or restart:
    1. Open Kiro settings and navigate to "MCP Servers"
    2. Find the Firebase MCP server in the list
    3. Click the "Retry" or "Reconnect" button
    4. Wait for the server status to show as "Connected"
    5. Test the connection again with `firebase_get_environment`


## Usage and Features

Once configured, the MCP server will automatically provide Firebase capabilities to your AI assistant. You can:

- Ask the AI to help set up Firebase services
- Query your Firestore database
- Manage authentication users
- Deploy to Firebase Hosting
- And much more!

## Firebase Services Overview

### Core Services Available via MCP
- **Authentication**: User management, sign-in methods, custom claims
- **Firestore**: NoSQL document database with real-time sync
- **App Hosting**: Full-stack app deployment with SSR
- **Storage**: File storage and serving
- **Cloud Functions**: Serverless backend code
- **Hosting**: Web app deployment to global CDN
- **Cloud Messaging**: Push notifications
- **Remote Config**: Dynamic app configuration
- **Crashlytics**: Crash reporting and analysis


### Using Firebase MCP Tools
The Firebase MCP server provides tools for:
- Managing Firebase projects and apps
- Initializing and deploying services
- Querying and manipulating Firestore data
- Managing Authentication users
- Validating Security Rules
- Sending Cloud Messaging notifications
- Viewing Cloud Functions logs
- And more...


## Additional Resources
- Firebase Documentation: https://firebase.google.com/docs
- Firebase YouTube Channel: https://www.youtube.com/firebase
- Firebase MCP Server: https://firebase.google.com/docs/ai-assistance/mcp-server
