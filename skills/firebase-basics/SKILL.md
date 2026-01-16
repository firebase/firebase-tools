---
name: firebase-basics
description: Guide for setting up and using Firebase. Use this skill when the user is getting started with Firebase - setting up local environment, using Firebase for the first time, or adding Firebase to their app.
---
## Prerequisites

### Node.js and npm
To use the Firebase CLI, you need Node.js (version 20+ required) and npm (which comes with Node.js).

**Recommended: Use a Node Version Manager (nvm)**
This avoids permission issues when installing global packages.

1.  **Install nvm:**
    - Mac/Linux: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash`
    - Windows: Download [nvm-windows](https://github.com/coreybutler/nvm-windows/releases)

2.  **Install Node.js:**
    ```bash
    nvm install 24
    nvm use 24
    ```

**Alternative: Official Installer**
Download and install the LTS version from [nodejs.org](https://nodejs.org/).

**Verify Installation:**
```bash
node --version
npm --version
```

## Core Workflow

### 1. Installation

Install the Firebase CLI globally via npm:

```bash
npm install -g firebase-tools
```

Verify installation:
```bash
firebase --version
```

### 2. Authentication

Log in to Firebase:

```bash
firebase login
```

- This opens a browser for authentication.
- For environments where localhost is not available (e.g., remote shell), use `firebase login --no-localhost`.

### 3. Creating a Project

To create a new Firebase project from the CLI:

```bash
firebase projects:create
```

You will be prompted to:
1. Enter a Project ID (must be unique globally).
2. Enter a display name.

### 4. Initialization

Initialize Firebase services in your project directory:

```bash
mkdir my-project
cd my-project
firebase init
```

The CLI will guide you through:
- Selecting features (Firestore, Functions, Hosting, etc.).
- Associating with an existing project or creating a new one.
- Configuring files (firebase.json, .firebaserc).

## Exploring Commands

The Firebase CLI documents itself. Instruct the user to use help commands to discover functionality.

- **Global Help**: List all available commands and categories.
  ```bash
  firebase --help
  ```

- **Command Help**: Get detailed usage for a specific command.
  ```bash
  firebase [command] --help
  # Example:
  firebase deploy --help
  firebase firestore:indexes --help
  ```

## SDK Setup

Detailed guides for adding Firebase to your app:

- **Web**: See [references/web_setup.md](references/web_setup.md)
- **iOS**: See [references/ios_setup.md](references/ios_setup.md)
- **Android**: See [references/android_setup.md](references/android_setup.md)
- **Flutter**: See [references/flutter_setup.md](references/flutter_setup.md)

## Common Issues

- **Permission Denied (EACCES)**: If `npm install -g` fails, suggest using a node version manager (nvm) or `sudo` (caution advised).
- **Login Issues**: If the browser doesn't open, try `firebase login --no-localhost`.
