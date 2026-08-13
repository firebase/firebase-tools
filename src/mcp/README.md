# Firebase MCP Server

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)
[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=firebase&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImZpcmViYXNlLXRvb2xzQGxhdGVzdCIsIm1jcCJdfQ==)

The Firebase Model Context Protocol (MCP) Server gives AI-powered development tools the ability to work with your Firebase projects and your app's codebase. The Firebase MCP server works with any tool that can act as an MCP client, including: [Firebase Studio](https://firebase.google.com/studio), [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://www.claude.com/product/claude-code), [Cline](https://github.com/cline/cline), [Cursor](https://www.cursor.com/), VS Code Copilot, [Windsurf](https://codeium.com/windsurf), and more!

## Features

An editor configured to use the Firebase MCP server can use its AI capabilities to help you:

- **Create and manage Firebase projects** - Initialize new projects, list existing ones, and manage Firebase apps
- **Manage Firebase Authentication users** - Retrieve, update, and manage user accounts
- **Work with Cloud Firestore and Firebase SQL Connect** - Query, read, write, and manage database documents
- **Retrieve Firebase SQL Connect schemas** - Generate schemas and operations with AI assistance
- **Understand security rules** - Validate and retrieve security rules for Firestore, Cloud Storage, and Realtime Database
- **Send messages with Firebase Cloud Messaging** - Send push notifications to devices and topics
- **Access Crashlytics data** - Debug issues, view crash reports, and manage crash analytics
- **Deploy to App Hosting** - Monitor backends and retrieve logs
- **Work with Realtime Database** - Read and write data in real-time
- **Query Cloud Functions logs** - Retrieve and analyze function execution logs
- **Manage Remote Config** - Get and update remote configuration templates

Some tools use [Gemini in Firebase](https://firebase.google.com/docs/ai-assistance) to help you:

- Generate Firebase SQL Connect schema and operations
- Consult Gemini about Firebase products

> **Important:** Gemini in Firebase can generate output that seems plausible but is factually incorrect. It may respond with inaccurate information that doesn't represent Google's views. Validate all output from Gemini before you use it and don't use untested generated code in production. Don't enter personally-identifiable information (PII) or user data into the chat.  
> Learn more about [Gemini in Firebase and how it uses your data](https://firebase.google.com/docs/ai-assistance).

## Installation and Setup

### Prerequisites

Make sure you have a working installation of [Node.js](http://nodejs.org/) and [npm](https://npmjs.org/).

### Basic Configuration

The Firebase MCP server can work with any MCP client that supports standard I/O (stdio) as the transport medium. When the Firebase MCP server makes tool calls, it uses the same user credentials that authorize the Firebase CLI in the environment where it's running.

Here are configuration instructions for popular AI-assistive tools:

#### Gemini CLI

Install the [Firebase extension for Gemini CLI](https://github.com/firebase/agent-skills):

```bash
gemini extensions install https://github.com/firebase/agent-skills
```

#### Claude Code

##### Option 1: Install via plugin (Recommended)

The easiest way to set up the Firebase MCP server in Claude Code is to install the official Firebase plugin:

1. Add the Firebase marketplace for Claude plugins:

   ```bash
   claude plugin marketplace add firebase/firebase-tools
   ```

2. Install the Claude plugin for Firebase:

   ```bash
   claude plugin install firebase@firebase
   ```

3. Verify the installation:

   ```bash
   claude plugin
   ```

##### Option 2: Configure MCP server manually

Alternatively, you can manually configure the Firebase MCP server by running:

```bash
claude mcp add firebase npx -- -y firebase-tools@latest mcp
```

You can verify the installation by running:

```bash
claude mcp list
```

It should show:

```
firebase: npx -y firebase-tools@latest mcp - ✓ Connected
```

#### Cursor

Add to `.cursorrules` in your project directory or configure in Cursor settings:

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp"]
    }
  }
}
```

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp"]
    }
  }
}
```

#### Firebase Studio

To configure Firebase Studio to use the Firebase MCP server, edit or create the configuration file: `.idx/mcp.json`

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp"]
    }
  }
}
```

## Usage

Once configured, the MCP server will automatically provide Firebase capabilities to your AI assistant. You can:

- Ask the AI to help set up Firebase services
- Query your Firestore database
- Manage authentication users
- Deploy to Firebase Hosting
- Debug Crashlytics issues
- And much more!

For a complete list of available tools and resources, see the [Server Capabilities](#server-capabilities) section below.

## Documentation

For more information, visit the [official Firebase MCP server documentation](https://firebase.google.com/docs/ai-assistance/mcp-server).

## Server Capabilities

The Firebase MCP server provides three types of capabilities: **Tools** (functions that perform actions), **Prompts** (reusable command templates), and **Resources** (documentation files for AI models).

| Tool Name                        | Feature Group    | Description                                                                                                                                                            |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apphosting_fetch_logs            | apphosting       | Fetch recent service or build logs for an App Hosting backend.                                                                                                         |
| apphosting_list_backends         | apphosting       | List App Hosting backends, traffic configurations, and custom domains in your project.                                                                                 |
| auth_get_users                   | auth             | Retrieve Firebase Auth users by UID, email, phone number, or list all users.                                                                                           |
| auth_update_user                 | auth             | Update a user's account by enabling/disabling it or setting custom claims.                                                                                             |
| auth_set_sms_region_policy       | auth             | Set an SMS region policy allowing or denying specific country codes for Firebase Authentication.                                                                       |
| firebase_login                   | core             | Sign the user into the Firebase CLI and MCP server or check current authentication status.                                                                             |
| firebase_logout                  | core             | Sign the user out of the Firebase CLI and MCP server.                                                                                                                  |
| firebase_validate_security_rules | core             | Validate syntax and check for errors in Firestore, Storage, or Realtime Database security rules.                                                                       |
| firebase_get_project             | core             | Retrieve metadata and configuration details for the currently active Firebase project.                                                                                 |
| firebase_list_apps               | core             | List all Firebase apps registered in the active project.                                                                                                               |
| firebase_list_projects           | core             | List Firebase projects accessible by the authenticated user.                                                                                                           |
| firebase_get_sdk_config          | core             | Retrieve SDK configuration details or config file contents for a registered Firebase app.                                                                              |
| firebase_create_project          | core             | Create a new Firebase project or enable Firebase services on an existing Google Cloud project.                                                                         |
| firebase_create_app              | core             | Create a new iOS, Android, or Web app in the active Firebase project.                                                                                                  |
| firebase_create_android_sha      | core             | Add a SHA-1 or SHA-256 certificate hash to an Android app in the active Firebase project.                                                                              |
| firebase_get_environment         | core             | Retrieve the current Firebase CLI and MCP environment configuration, active project, and authenticated user.                                                           |
| firebase_update_environment      | core             | Update environment settings such as project directory, active project, or active user account.                                                                         |
| firebase_init                    | core             | Initialize and configure Firebase services in your local project workspace.                                                                                            |
| firebase_get_security_rules      | core             | Retrieve the active security rules for Firestore, Storage, or Realtime Database.                                                                                       |
| firebase_read_resources          | core             | Read the contents of internal firebase:// documentation resources or list all available resources.                                                                     |
| crashlytics_create_note          | crashlytics      | Add a note to a Crashlytics issue for an Android or iOS app.                                                                                                           |
| crashlytics_delete_note          | crashlytics      | Delete a note from a Crashlytics issue for an Android or iOS app.                                                                                                      |
| crashlytics_get_issue            | crashlytics      | Retrieve details and metadata for a specific Crashlytics issue.                                                                                                        |
| crashlytics_list_events          | crashlytics      | List recent crash and exception events matching specified filters for an issue.                                                                                        |
| crashlytics_batch_get_events     | crashlytics      | Retrieve sample crash and exception events by resource name for debugging.                                                                                             |
| crashlytics_list_notes           | crashlytics      | List all notes attached to a Crashlytics issue for an Android or iOS app.                                                                                              |
| crashlytics_get_report           | crashlytics      | Generate aggregated numerical reports for Crashlytics issues and events.                                                                                               |
| crashlytics_update_issue         | crashlytics      | Update the state (OPEN or CLOSED) of a Crashlytics issue.                                                                                                              |
| realtimedatabase_get_data        | realtimedatabase | Read data from a specified path in the Firebase Realtime Database.                                                                                                     |
| realtimedatabase_set_data        | realtimedatabase | Write JSON data to a specified path in the Firebase Realtime Database.                                                                                                 |
| dataconnect_build                | dataconnect      | Compile Firebase SQL Connect schemas, operations, and connectors to validate syntax and types.                                                                         |
| dataconnect_list_services        | dataconnect      | List local and deployed Firebase SQL Connect services, schemas, and connectors.                                                                                        |
| dataconnect_execute              | dataconnect      | Execute a GraphQL query or mutation against a Firebase SQL Connect service or emulator.                                                                                |
| firestore_delete_document        | firestore        | Use this to delete Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document.               |
| firestore_get_documents          | firestore        | Use this to retrieve one or more Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document. |
| firestore_list_collections       | firestore        | Use this to retrieve a list of collections from a Firestore database in the current project.                                                                           |
| firestore_query_collection       | firestore        | Query Firestore documents from a collection with optional filters and ordering.                                                                                        |
| functions_get_logs               | functions        | Retrieve and filter Cloud Functions log entries from Google Cloud Logging.                                                                                             |
| functions_list_functions         | functions        | List all deployed Cloud Functions in your Firebase project.                                                                                                            |
| messaging_send_message           | messaging        | Send a Firebase Cloud Messaging push notification to a device registration token or topic.                                                                             |
| remoteconfig_get_template        | remoteconfig     | Retrieve the active or specified version of the Firebase Remote Config template.                                                                                       |
| remoteconfig_update_template     | remoteconfig     | Publish a new Firebase Remote Config template or rollback to a previous version.                                                                                       |
| storage_get_object_download_url  | storage          | Retrieve the download URL for an object in a Cloud Storage bucket.                                                                                                     |

| Prompt Name                       | Feature Group | Description                                                                                                                                                       |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| firebase:deploy                   | core          | Use this command to deploy resources to Firebase. <br><br>Arguments: <br>&lt;prompt&gt; (optional): any specific instructions you wish to provide about deploying |
| firebase:init                     | core          | Use this command to set up Firebase services, like backend and AI features.                                                                                       |
| firestore:generate_security_rules | firestore     | Generate secure Firebase Firestore Security Rules and corresponding unit tests for your project.                                                                  |
| storage:generate_security_rules   | storage       | Generate secure Firebase Storage Security Rules and corresponding unit tests for your project.                                                                    |
| crashlytics:connect               | crashlytics   | Use this command to access a Firebase application's Crashlytics data.                                                                                             |

| Resource Name                    | Description                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| app_id_guide                     | Firebase App Id Guide: guides the coding agent through choosing a Firebase App ID in the current project                                                                                                                                    |
| crashlytics_investigations_guide | Firebase Crashlytics Investigations Guide: Guides the coding agent when investigating bugs reported in Crashlytics issues, including procedures for diagnosing and fixing crashes.                                                          |
| crashlytics_issues_guide         | Firebase Crashlytics Issues Guide: Guides the coding agent when working with Crashlytics issues, including prioritization rules and procedures for diagnosing and fixing crashes.                                                           |
| crashlytics_reports_guide        | Firebase Crashlytics Reports Guide: Guides the coding agent through requesting Crashlytics reports, including setting appropriate filters and how to understand the metrics. The agent should read this guide before requesting any report. |
| backend_init_guide               | Firebase Backend Init Guide: guides the coding agent through configuring Firebase backend services in the current project                                                                                                                   |
| ai_init_guide                    | Firebase GenAI Init Guide: guides the coding agent through configuring GenAI capabilities in the current project utilizing Firebase                                                                                                         |
| firestore_init_guide             | Firestore Init Guide: guides the coding agent through configuring Firestore in the current project                                                                                                                                          |
| firestore_rules_init_guide       | Firestore Rules Init Guide: guides the coding agent through setting up Firestore security rules in the project                                                                                                                              |
| auth_init_guide                  | Firebase Authentication Init Guide: guides the coding agent through configuring Firebase Authentication in the current project                                                                                                              |
| hosting_init_guide               | Firebase Hosting Deployment Guide: guides the coding agent through deploying to Firebase Hosting in the current project                                                                                                                     |
| docs                             | Firebase Docs: loads plain text content from Firebase documentation, e.g. `https://firebase.google.com/docs/functions` becomes `firebase://docs/functions`                                                                                  |
