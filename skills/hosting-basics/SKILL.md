---
name: hosting-basics
description: Skill for working with Firebase Hosting (Classic). Use this when you want to deploy static web apps, Single Page Apps (SPAs), or simple microservices. Do NOT use for Firebase App Hosting.
---

# hosting-basics

This skill provides instructions and references for working with Firebase Hosting, a fast and secure hosting service for your web app, static and dynamic content, and microservices.

## Overview

Firebase Hosting provides production-grade web content hosting for developers. With a single command, you can deploy web apps and serve both static and dynamic content to a global CDN (content delivery network).

**Key Features:**
- **Fast Content Delivery:** Files are cached on SSDs at CDN edges around the world.
- **Secure by Default:** Zero-configuration SSL is built-in.
- **Preview Channels:** View and test changes on temporary preview URLs before deploying live.
- **GitHub Integration:** Automate previews and deploys with GitHub Actions.
- **Dynamic Content:** Serve dynamic content and microservices using Cloud Functions or Cloud Run.

## Hosting vs App Hosting

**Choose Firebase Hosting if:**
- You are deploying a static site (HTML/CSS/JS).
- You are deploying a simple SPA (React, Vue, etc. without SSR).
- You want full control over the build and deploy process via CLI.

**Choose Firebase App Hosting if:**
- You are using a supported full-stack framework like Next.js or Angular.
- You need Server-Side Rendering (SSR) or ISR.
- You want an automated "git push to deploy" workflow with zero configuration.

## Instructions

### 1. Configuration (`firebase.json`)
For details on configuring Hosting behavior, including public directories, redirects, rewrites, and headers, see [configuration.md](configuration.md).

### 2. Deploying
For instructions on deploying your site, using preview channels, and managing releases, see [deploying.md](deploying.md).

### 3. Emulation
To test your app locally:
```bash
firebase emulators:start --only hosting
```
This serves your app at `http://localhost:5000` by default.
