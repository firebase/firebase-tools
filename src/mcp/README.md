# Firebase MCP Server

The Firebase MCP Server provides assistive utilities to compatible AI-assistant
development tools.

## Usage

The Firebase MCP server uses the Firebase CLI for authentication and project
selection. You will usually want to start the server with a specific directory
as an argument to operate against the project of your working directory.

For clients that don't operate within a specific workspace, the Firebase MCP
server makes tools available to read and write a project directory.

### Example: Cursor

In `.cursor/mcp.json` in your workspace directory, add the Firebase MCP server:

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools", "experimental:mcp", "--dir", "<your_absolute_workspace_dir>"]
    }
  }
}
```

### Command Line Options

- `--dir <absolute_dir_path>`: The absolute path of a directory containing `firebase.json` to set a project context for the MCP server. If unspecified, the `{get|set}_project_directory` tools will become available and the default directory will be the working directory where the MCP server was started.
- `--only <feature1,feature2>`: A comma-separated list of feature groups to activate. Use this to limit the tools exposed to only features you are actively using.

## Tools

| Tool Name                        | Feature Group | Description                                                                                                                                                                                                    |
| -------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_project_directory`          | `directory`   | When running without the `--dir` command, retrieves the current directory (defaults to current working directory).                                                                                             |
| `set_project_directory`          | `directory`   | When running without the `--dir` command, sets the current project directory (i.e. one with `firebase.json` in it).                                                                                            |
| `firebase_get_project`           | `core`        | Get basic information about the active project in the current Firebase directory.                                                                                                                              |
| `firebase_list_apps`             | `core`        | List registered apps for the currently active project.                                                                                                                                                         |
| `firebase_get_sdk_config`        | `core`        | Get an Firebase client SDK config for a specific platform.                                                                                                                                                     |
| `firebase_consult_assistant`     | `core`        | Consult Gemini in Firebase agent for help                                                                                                                                                                      |
| `firestore_list_collections`     | `firestore`   | Retrieves a list of collections from a Firestore database in the current project.                                                                                                                              |
| `firestore_get_documents`        | `firestore`   | Retrieves one or more Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document.                                                    |
| `firestore_get_rules`            | `firestore`   | Retrieves the active Firestore security rules for the current project.                                                                                                                                         |
| `auth_get_user`                  | `auth`        | Retrieves a user based on an email address, phone number, or UID.                                                                                                                                              |
| `auth_disable_user`              | `auth`        | Disables or enables a user based on a UID.                                                                                                                                                                     |
| `auth_set_claims`                | `auth`        | Sets custom claims on a specific user's account. Use to create trusted values associated with a user e.g. marking them as an admin. Claims are limited in size and should be succinct in name and value.       |
| `auth_set_sms_region_policy`     | `auth`        | Sets an SMS Region Policy for Firebase Auth to restrict the regions which can receive text messages based on an ALLOW or DENY list of country codes. This policy will override any existing policies when set. |
| `dataconnect_list_services`      | `dataconnect` | List the Firebase Data Connect services available in the current project.                                                                                                                                      |
| `dataconnect_generate_schema`    | `dataconnect` | Generates a Firebase Data Connect Schema based on the users description of an app.                                                                                                                             |
| `dataconnect_generate_operation` | `dataconnect` | Generates a single Firebase Data Connect query or mutation based on the currently deployed schema and the provided prompt.                                                                                     |
| `dataconnect_get_schema`         | `dataconnect` | List the Firebase Data Connect Schema in the project, which includes Cloud SQL data sources and the GraphQL Schema describing what tables are available.                                                       |
| `dataconnect_get_connector`      | `dataconnect` | Get the Firebase Data Connect Connectors in the project, which includes the pre-defined GraphQL queries accessible to client SDKs.                                                                             |
| `storage_get_rules`              | `storage`     | Retrieves the Firebase Cloud Storage Rules for the default bucket.                                                                                                                                             |
