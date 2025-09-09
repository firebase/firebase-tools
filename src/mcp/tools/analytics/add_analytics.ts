import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";

const resourceContent = `
# Firebase Google Analytics Setup Guide

This guide provides step-by-step instructions for integrating Google Analytics into your web and mobile applications using the Firebase SDK. In addition, this guide gives you information on how to instrument the user's app with Google Analytics. You may skip any setup steps if you find that the user's app is already setup to run Firebase Analytics.

We will cover the initial setup and provide best practices for instrumenting your code to collect meaningful data. To instrument an app with Google Analytics, you'll need to integrate the appropriate SDK and configure it to track user interactions. The process differs slightly between web and mobile apps.

---

## Prerequisites

Before you begin, ensure you have the following:

1.  **A Firebase Project**: If you don't have one, create a project in the [Firebase Console](https://console.firebase.google.com/).
2.  **Google Analytics Enabled**: In your Firebase Project settings, navigate to the **Integrations** tab and ensure Google Analytics is enabled. You may need to create a new Google Analytics property or link an existing one.
3.  **Node.js & Firebase CLI**: Make sure you have Node.js installed. Then, install the Firebase CLI globally to manage your projects from the command line:
    \`\`\`bash
    npm install -g firebase-tools
    firebase login
    \`\`\`
4.  **Your App's Codebase**: Have your web or mobile application code ready in your development environment.

---

## Common Setup Instructions

No matter what platform, you will need to first determine the Firebase Project and Firebase App, and fetch the Firebase Config for the user.

Before going through this step, check if the user already has firebase configuration code for Firebase in their app by searching for \`firebaseConfig\`. If it's already included in their app, skip this step.

### Step 1: Firebase Project

 - Use the tool \`firebase_get_project\` to determine if there's an active project.
   - If there is, fetch the active configuration via \`firebase_list_apps\` and then \`firebase_get_sdk_config\`
   - If there isn't an active project, ask the user if they'd like to use an existing project, or create a new one
     - If create a new one, use \`firebase_create_project\` to create it
     - If use an existing one, use the command line tool \`firebase use <project-id>\` (you can use \`firebase_list_projects\` to list project IDs if the user doesn't specify an ID).

### Step 2: Fetch the Firebase Configuration

Then, we will need to determine the Firebase App, and fetch its configuration.

Use \`firebase_list_apps\` to see what apps are available, and choose one that is approapriate to the current app in the directory (eg. by comparing the name against the user's \`package.json\`).
 - If there are no available web apps, use \`firebase_create_app\` to create one.

Finally, use \`firebase_get_sdk_config\` to get the App's Firebase Config.

## Setup for Web Apps
### Step 1: Install the Firebase SDK

First, check if the user already has \`firebase\` installed by checking their \`package.json\` file. If it's already installed, you can skip this step.

Using npm (or your preferred package manager), install the Firebase SDK into your project.

\`\`\`bash
npm install firebase
\`\`\`

### Step 2: Initialize Firebase

Before going through this step, check if the user already has initialization code for Firebase Analytics by searching for \`initializeApp\` and \`getAnalytics\` separately. If it's already setup, skip this step.

\`\`\`js
// Import the functions you need from the SDKs
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration, from the result of \`firebase_get_sdk_config\`
const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "...",
  appId: "1:...",
  measurementId: "G-..." // This is the Google Analytics measurement ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics and get a reference to the service
const analytics = getAnalytics(app);
\`\`\`

# Instrumenting Your Code for Analytics
### Logging Custom Events

Use the logEvent function to send custom events. This helps you understand what users are doing in your app. Firebase has a list of recommended events that come with pre-built reporting, but you can also create your own. More information can be found at https://firebase.google.com/docs/analytics/events?platform=web.

\`\`\`
import { getAnalytics, logEvent } from "firebase/analytics";

const analytics = getAnalytics();
logEvent(analytics, 'share_item', {
  item_name: 'Summer T-Shirt',
  method: 'Twitter'
});
\`\`\`

# Setting User Properties
User properties are attributes you define to describe segments of your user base, such as language preference or geographic location.

\`\`\`
import { getAnalytics, setUserProperty } from "firebase/analytics";

const analytics = getAnalytics();
setUserProperty(analytics, 'user_tier', 'premium');
\`\`\`


`;

export const add_analytics = tool(
  {
    name: "add_analytics",
    description: "Describes how to setup and instrument an app with Google Analytics. This tool may be run more than once if the user would like to continue instrumenting their app.",
    inputSchema: z.object({}),
    annotations: {
      title: "How to setup and instrument an app with Google Analytics",
      readOnlyHint: true,
    },
  },
  async () => {
    return toContent(resourceContent);
  },
);
