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

Generate the  below table using the following command:

```bash
firebase experimental:mcp --generate-tool-docs
```

| Tool Name | Feature Group | Description |
| --------- | ------------- | ----------- |
| firebase_get_project | directory | Retrieves information about the currently active Firebase project. |
| firebase_use_project | directory | Select a Firebase Project to use for subsequent tool calls. |
| firebase_list_apps | directory | Retrieves apps registered in the current Firebase project. |
| firebase_get_sdk_config | directory | Retrieves the Firebase SDK configuration information for the specified platform. You must specify either a platform or an app_id. |
| firebase_consult_assistant | directory | Send a question to an AI assistant specifically enhanced to answer Firebase questions. |
| firebase_init | directory | Initialize the Firebase Products. It takes a feature map to describe each desired product. |
| get_project_directory | directory | Gets the current Firebase project directory. If this has been set using the `set_project_directory` tool it will return that, otherwise it will look for a PROJECT_ROOT environment variable or the current working directory of the running Firebase MCP server. |
| set_project_directory | directory | Sets the project directory for the Firebase MCP server to utilize for project detection and authentication. This should be a directory with a `firebase.json` file in it. This information is persisted between sessions. |
| firestore_delete_document | directory | Deletes a Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document. |
| firestore_get_documents | directory | Retrieves one or more Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document. |
| firestore_get_rules | directory | Retrieves the active Firestore security rules for the current project. |
| firestore_list_collections | directory | Retrieves a list of collections from a Firestore database in the current project. |
| firestore_query_collection | directory | Retrieves one or more Firestore documents from a collection is a database in the current project by a collection with a full document path. Use this if you know the exact path of a collection and the filtering clause you would like for the document. |
| auth_get_user | directory | Retrieves a user based on an email address, phone number, or UID. |
| auth_disable_user | directory | Disables or enables a user based on a UID. |
| auth_list_users | directory | Retrieves all users in the project up to the specified limit. |
| auth_set_claims | directory | Sets custom claims on a specific user's account. Use to create trusted values associated with a user e.g. marking them as an admin. Claims are limited in size and should be succinct in name and value. Specify ONLY ONE OF `value` or `json_value` parameters. |
| auth_set_sms_region_policy | directory | Sets an SMS Region Policy for Firebase Auth to restrict the regions which can receive text messages based on an ALLOW or DENY list of country codes. This policy will override any existing policies when set. |
| dataconnect_list_services | directory | List the Firebase Data Connect services available in the current project. |
| dataconnect_generate_schema | directory | Generates a Firebase Data Connect Schema based on the users description of an app. |
| dataconnect_generate_operation | directory | Generates a single Firebase Data Connect query or mutation based on the currently deployed schema and the provided prompt. |
| dataconnect_get_schema | directory | List the Firebase Data Connect Schema in the project, which includes Cloud SQL data sources and the GraphQL Schema describing what tables are available. |
| dataconnect_get_connector | directory | Get the Firebase Data Connect Connectors in the project, which includes the pre-defined GraphQL queries accessible to client SDKs. |
| dataconnect_execute_graphql | directory | Executes an arbitrary GraphQL against a Data Connect service |
| dataconnect_execute_graphql_read | directory | Executes an arbitrary GraphQL against a Data Connect service. Cannot write data. |
| dataconnect_execute_mutation | directory | Executes a deployed Data Connect mutation. Can read and write data. |
| dataconnect_execute_query | directory | Executes a deployed Data Connect query. Cannot write any data. |
| storage_get_rules | directory | Retrieves the Firebase Cloud Storage Rules for the default bucket. |
| storage_get_object_download_url | directory | Retrieves the download URL for an object in Firebase Storage. |
| messaging_send_message_to_fcm_token | directory | Sends a message to FCM Token |
| messaging_send_message_to_fcm_topic | directory | Sends a message to an FCM Topic |
| remoteconfig_get_template | directory | Retrieves a remote config template for the project |
