# Firebase MCP Server

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)
[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=firebase&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImZpcmViYXNlLXRvb2xzQGxhdGVzdCIsIm1jcCJdfQ==)

The Firebase Model Context Protocol (MCP) Server gives AI-powered development tools the ability to work with your Firebase projects and your app's codebase. The Firebase MCP server works with any tool that can act as an MCP client, including: [Firebase Studio](https://firebase.google.com/studio), [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://www.claude.com/product/claude-code), [Cline](https://github.com/cline/cline), [Cursor](https://www.cursor.com/), VS Code Copilot, [Windsurf](https://codeium.com/windsurf), and more!

## Features

An editor configured to use the Firebase MCP server can use its AI capabilities to help you:

- **Create and manage Firebase projects** - Initialize new projects, list existing ones, and manage Firebase apps
- **Manage Firebase Authentication users** - Retrieve, update, and manage user accounts
- **Work with Cloud Firestore and Firebase Data Connect** - Query, read, write, and manage database documents
- **Retrieve Firebase Data Connect schemas** - Generate schemas and operations with AI assistance
- **Understand security rules** - Validate and retrieve security rules for Firestore, Cloud Storage, and Realtime Database
- **Send messages with Firebase Cloud Messaging** - Send push notifications to devices and topics
- **Access Crashlytics data** - Debug issues, view crash reports, and manage crash analytics
- **Deploy to App Hosting** - Monitor backends and retrieve logs
- **Work with Realtime Database** - Read and write data in real-time
- **Query Cloud Functions logs** - Retrieve and analyze function execution logs
- **Manage Remote Config** - Get and update remote configuration templates

Some tools use [Gemini in Firebase](https://firebase.google.com/docs/ai-assistance) to help you:

- Generate Firebase Data Connect schema and operations
- Consult Gemini about Firebase products

> **Important:** Gemini in Firebase can generate output that seems plausible but is factually incorrect. It may respond with inaccurate information that doesn't represent Google's views. Validate all output from Gemini before you use it and don't use untested generated code in production. Don't enter personally-identifiable information (PII) or user data into the chat.  
> Learn more about [Gemini in Firebase and how it uses your data](https://firebase.google.com/docs/ai-assistance).

## Installation and Setup

### Prerequisites

Make sure you have a working installation of [Node.js](http://nodejs.org/) and [npm](https://npmjs.org/).

### Basic Configuration

The Firebase MCP server supports two transport modes:

1. **STDIO (Default)**: Uses standard I/O for communication. Suitable for local MCP clients that spawn the server as a subprocess.
2. **Streamable HTTP**: Uses HTTP POST/GET with Server-Sent Events (SSE) for streaming. Suitable for remote connections, production deployments, and horizontal scaling.

When the Firebase MCP server makes tool calls, it uses the same user credentials that authorize the Firebase CLI in the environment where it's running.

Here are configuration instructions for popular AI-assistive tools:

#### Gemini CLI

Install the [Firebase extension for Gemini CLI](https://github.com/gemini-cli-extensions/firebase/):

```bash
gemini extensions install https://github.com/gemini-cli-extensions/firebase/
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

### HTTP Transport (Streamable HTTP)

For remote connections or production deployments, you can run the Firebase MCP server with Streamable HTTP transport:

```bash
# Start the server with HTTP transport
npx firebase-tools mcp --transport streamable-http --port 8000

# With a specific host binding
npx firebase-tools mcp --transport streamable-http --host 0.0.0.0 --port 8000

# Stateless mode for horizontal scaling (no server-side session tracking)
npx firebase-tools mcp --transport streamable-http --port 8000 --stateless
```

#### HTTP Transport Options

| Option | Description | Default |
|--------|-------------|---------|
| `--transport` | Transport mode: `stdio` or `streamable-http` | `stdio` |
| `--port` | HTTP server port | `8000` |
| `--host` | HTTP server host | `127.0.0.1` |
| `--stateless` | Enable stateless mode for horizontal scaling | `false` |

#### MCP Client Configuration for HTTP Transport

Configure your MCP client to connect via HTTP:

```json
{
  "mcpServers": {
    "firebase": {
      "transport": {
        "type": "streamable-http",
        "url": "http://localhost:8000/mcp"
      }
    }
  }
}
```

#### HTTP Endpoints

When running in HTTP mode, the server exposes:

- `POST /mcp` - Main MCP endpoint for JSON-RPC requests
- `GET /mcp` - SSE endpoint for server-initiated messages
- `DELETE /mcp` - Session termination (when not in stateless mode)
- `GET /health` - Health check endpoint

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

| Tool Name                        | Feature Group    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| apphosting_fetch_logs            | apphosting       | Use this to fetch the most recent logs for a specified App Hosting backend. If `buildLogs` is specified, the logs from the build process for the latest build are returned. The most recent logs are listed first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| apphosting_list_backends         | apphosting       | Use this to retrieve a list of App Hosting backends in the current project. An empty list means that there are no backends. The `uri` is the public URL of the backend. A working backend will have a `managed_resources` array that will contain a `run_service` entry. That `run_service.service` is the resource name of the Cloud Run service serving the App Hosting backend. The last segment of that name is the service ID. `domains` is the list of domains that are associated with the backend. They either have type `CUSTOM` or `DEFAULT`. Every backend should have a `DEFAULT` domain. The actual domain that a user would use to connect to the backend is the last parameter of the domain resource name. If a custom domain is correctly set up, it will have statuses ending in `ACTIVE`. |
| auth_get_users                   | auth             | Use this to retrieve one or more Firebase Auth users based on a list of UIDs or a list of emails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| auth_update_user                 | auth             | Use this to disable, enable, or set a custom claim on a specific user's account.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| auth_set_sms_region_policy       | auth             | Use this to set an SMS region policy for Firebase Authentication to restrict the regions which can receive text messages based on an ALLOW or DENY list of country codes. This policy will override any existing policies when set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| firebase_login                   | core             | Use this to sign the user into the Firebase CLI and Firebase MCP server. This requires a Google Account, and sign in is required to create and work with Firebase Projects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| firebase_logout                  | core             | Use this to sign the user out of the Firebase CLI and Firebase MCP server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| firebase_validate_security_rules | core             | Use this to check Firebase Security Rules for Firestore, Storage, or Realtime Database for syntax and validation errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| firebase_get_project             | core             | Use this to retrieve information about the currently active Firebase Project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| firebase_list_apps               | core             | Use this to retrieve a list of the Firebase Apps registered in the currently active Firebase project. Firebase Apps can be iOS, Android, or Web.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| firebase_list_projects           | core             | Use this to retrieve a list of Firebase Projects that the signed-in user has access to.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| firebase_get_sdk_config          | core             | Use this to retrieve the Firebase configuration information for a Firebase App. You must specify EITHER a platform OR the Firebase App ID for a Firebase App registered in the currently active Firebase Project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| firebase_create_project          | core             | Use this to create a new Firebase Project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| firebase_create_app              | core             | Use this to create a new Firebase App in the currently active Firebase Project. Firebase Apps can be iOS, Android, or Web.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| firebase_create_android_sha      | core             | Use this to add the specified SHA certificate hash to the specified Firebase Android App.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| firebase_get_environment         | core             | Use this to retrieve the current Firebase **environment** configuration for the Firebase CLI and Firebase MCP server, including current authenticated user, project directory, active Firebase Project, and more. All tools require the user to be authenticated, but not all information is required for all tools. Pay attention to the tool requirements for which pieces of information are required.                                                                                                                                                                                                                                                                                                                                                                                                    |
| firebase_update_environment      | core             | Use this to update environment config for the Firebase CLI and Firebase MCP server, such as project directory, active project, active user account, accept terms of service, and more. Use `firebase_get_environment` to see the currently configured environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| firebase_init                    | core             | Use this to initialize selected Firebase services in the workspace (Cloud Firestore database, Firebase Data Connect, Firebase Realtime Database, Firebase AI Logic). All services are optional; specify only the products you want to set up. You can initialize new features into an existing project directory, but re-initializing an existing feature may overwrite configuration. To deploy the initialized features, run the `firebase deploy` command after `firebase_init` tool.                                                                                                                                                                                                                                                                                                                     |
| firebase_get_security_rules      | core             | Use this to retrieve the security rules for a specified Firebase service. If there are multiple instances of that service in the product, the rules for the default instance are returned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| firebase_read_resources          | core             | Use this to read the contents of `firebase://` resources or list available resources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| crashlytics_create_note          | crashlytics      | Add a note to an issue from crashlytics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| crashlytics_delete_note          | crashlytics      | Delete a note from a Crashlytics issue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| crashlytics_get_issue            | crashlytics      | Gets data for a Crashlytics issue, which can be used as a starting point for debugging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| crashlytics_list_events          | crashlytics      | Use this to list the most recent events matching the given filters.<br> Can be used to fetch sample crashes and exceptions for an issue,<br> which will include stack traces and other data useful for debugging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| crashlytics_batch_get_events     | crashlytics      | Gets specific events by resource name.<br> Can be used to fetch sample crashes and exceptions for an issue,<br> which will include stack traces and other data useful for debugging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| crashlytics_list_notes           | crashlytics      | Use this to list all notes for an issue in Crashlytics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| crashlytics_get_report           | crashlytics      | Use this to request numerical reports from Crashlytics. The result aggregates the sum of events and impacted users, grouped by a dimension appropriate for that report. Agents must read the [Firebase Crashlytics Reports Guide](firebase://guides/crashlytics/reports) using the `firebase_read_resources` tool before calling to understand critical prerequisites for requesting reports and how to interpret the results.                                                                                                                                                                                                                                                                                                                                                                               |
| crashlytics_update_issue         | crashlytics      | Use this to update the state of Crashlytics issue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| realtimedatabase_get_data        | realtimedatabase | Use this to retrieve data from the specified location in a Firebase Realtime Database.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| realtimedatabase_set_data        | realtimedatabase | Use this to write data to the specified location in a Firebase Realtime Database.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| dataconnect_build                | dataconnect      | Use this to compile Firebase Data Connect schema, operations, and/or connectors and check for build errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| dataconnect_list_services        | dataconnect      | Use this to list existing local and backend Firebase Data Connect services                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| dataconnect_execute              | dataconnect      | Use this to execute a GraphQL operation against a Data Connect service or its emulator.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| firestore_delete_document        | firestore        | Use this to delete Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| firestore_get_documents          | firestore        | Use this to retrieve one or more Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| firestore_list_collections       | firestore        | Use this to retrieve a list of collections from a Firestore database in the current project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| firestore_query_collection       | firestore        | Use this to retrieve one or more Firestore documents from a collection in a database in the current project by a collection with a full document path. Use this if you know the exact path of a collection and the filtering clause you would like for the document.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| functions_get_logs               | functions        | Use this to retrieve a page of Cloud Functions log entries using Google Cloud Logging advanced filters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| functions_list_functions         | functions        | List all deployed functions in your Firebase project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| messaging_send_message           | messaging        | Use this to send a message to a Firebase Cloud Messaging registration token or topic. ONLY ONE of `registration_token` or `topic` may be supplied in a specific call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| remoteconfig_get_template        | remoteconfig     | Use this to retrieve the specified Firebase Remote Config template from the currently active Firebase Project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| remoteconfig_update_template     | remoteconfig     | Use this to publish a new remote config template or roll back to a specific version for the project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| storage_get_object_download_url  | storage          | Use this to retrieve the download URL for an object in a Cloud Storage for Firebase bucket.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

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
