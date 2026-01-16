---
name: app-hosting-basics
description: Deploy and manage web apps with Firebase App Hosting. Use when deploying Next.js/Angular apps, managing backends/rollouts/secrets via CLI, or configuring apphosting.yaml.
---

# App Hosting Basics

## Description
This skill enables the agent to deploy and manage modern, full-stack web applications (Next.js, Angular, etc.) using Firebase App Hosting. 

## Instructions
1.  **Use CLI commands**: Directly execute `firebase apphosting` commands to create backends, trigger rollouts, and manage resources
2.  **Configure App Hosting**: Create or edit `apphosting.yaml` to configure Cloud Run settings (CPU, memory) and environment variables as requested by the user.
3.  **Manage Secrets**: Use `firebase apphosting:secrets` commands to set and grant access to secrets.
4.  **Setup Emulation**: Configure `apphosting.emulator.yaml` and use the local emulator (`firebase emulators:start --only apphosting`) to verify changes.

## Overview

### What is App Hosting?
Firebase App Hosting is a serverless hosting solution designed specifically for modern, full-stack web applications. It automates the build and deployment process directly from your GitHub repository.

### Key Features
- **Zero-config builds**: Automatically detects and builds Next.js and Angular apps using Cloud Build packs.
- **GitHub Integration**: Deploys automatically when you push to your live branch (e.g., `main`).
- **Backend Infrastructure**: Provisions Cloud Run services, Cloud Build triggers, and other necessary resources automatically.
- **Global CDN**: Serves static content from a global CDN for high performance.

### Core Concepts
#### Backend
A **Backend** is the managed link between your Firebase project and your GitHub repository. It represents the infrastructure running your web app.
- A one-to-one mapping to a specific GitHub repository.
- Contains the configuration for production and rollout policies.

#### Rollout
A **Rollout** is a specific version of your app deployed to the backend.
- Triggered by git pushes or manually via CLI/Console.
- Each rollout is immutable and can be rolled back to.

### Supported Frameworks
- **Next.js**: Full support for SSR, ISR, and static generation.
- **Angular**: Support for Angular Universal (SSR) and static builds.
- **Custom Adapters**: Extensible architecture to support other frameworks.

## Resources
- [CLI Commands](references/cli_commands.md)
- [Configuration](references/configuration.md)
- [Emulation](references/emulation.md)
