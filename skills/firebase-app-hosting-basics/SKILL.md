---
name: firebase-app-hosting-basics
description: Deploy and manage web apps with Firebase App Hosting. Use this skill when deploying Next.js/Angular apps with backends.
---

# App Hosting Basics

## Description
This skill enables the agent to deploy and manage modern, full-stack web applications (Next.js, Angular, etc.) using Firebase App Hosting. 

**Important**: In order to use App Hosting, your Firebase project must be on the Blaze pricing plan. Direct the user to https://console.firebase.google.com/project/_/overview?purchaseBillingPlan=metered to upgrade their plan.

## Hosting vs App Hosting

**Choose Firebase Hosting if:**
- You are deploying a static site (HTML/CSS/JS).
- You are deploying a simple SPA (React, Vue, etc. without SSR).
- You want full control over the build and deploy process via CLI.

**Choose Firebase App Hosting if:**
- You are using a supported full-stack framework like Next.js or Angular.
- You need Server-Side Rendering (SSR) or ISR.
- You want an automated "git push to deploy" workflow with zero configuration.

## Importing an Existing Project

When a user asks to import a Firebase App Hosting project:
- Confirm Information and ask the user for any information you need (e.g., their project ID, backend names, region, or source code location).
- When importing a project for the first time, ask the user for a test or staging backend to deploy to (i.e., a new backend) to test changes safely. Do NOT deploy to production when doing an initial deployment.
- If you run into an error cloning a repository via HTTPS (like `fatal: could not read Username for 'https://github.com': Device not configured`), it might be due to the user's local git setup, and the SSH git clone (`git clone git@github.com:...`) might work instead.

## Deploying to App Hosting

### Deploy from Source

This is the recommended flow for most users. You should prefer to do source deployment (`firebase init apphosting` + `firebase deploy`). This allows the user or LLM agent to make changes to the code and deploy them without requiring Git commits or pushes. 
1. Configure `firebase.json` with an `apphosting` block.
    ```json
    {
      "apphosting": {
        "backendId": "my-app-id",
        "rootDir": "/",
        "ignore": [
          "node_modules",
          ".git",
          "firebase-debug.log",
          "firebase-debug.*.log",
          "functions"
        ]
      }
    }
    ```
2. Create or edit `apphosting.yaml`- see [Configuration](references/configuration.md) for more information on how to do so.
3. If the app needs safe access to sensitive keys, use `firebase apphosting:secrets` commands to set and grant access to secrets.
4. Run `firebase deploy` when you are ready to deploy.

### Automated deployment via GitHub (CI/CD)

Alternatively, set up a backend connected to a GitHub repository for automated deployments "git push" deployments.
This is only recommended for more advanced users, and is not required to use App Hosting.
See [CLI Commands](references/cli_commands.md) for more information on how to set this up using CLI commands.

## Emulation

See [Emulation](references/emulation.md) for more information on how to test your app locally using the Firebase Local Emulator Suite.
