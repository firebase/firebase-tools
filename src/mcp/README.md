# Firebase MCP Server

> [!NOTE]  
> The Firebase MCP Server is considered **experimental** and subject to breaking changes in _minor_ version updates of the Firebase CLI.

The Firebase MCP Server provides tools to interact with Firebase project resources in compatible AI-assisted development environments.

## Usage

The Firebase MCP server uses the Firebase CLI for authentication and project selection. You will usually want to start the server with a specific target directory as an argument to serve as the "project folder" where your `firebase.json` is or will be.

For global clients that don't operate within a specific workspace, the Firebase MCP Server makes tools available to read and write a project directory.

### Client Configuration

If you are using an MCP client that is configured with a JSON, the following example configuration should help you get started:

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools", "experimental:mcp", "--dir", "."]
    }
  }
}
```

### Authentication

The Firebase MCP Server shares authentication with the Firebase CLI. If you've never used the Firebase CLI before, you'll need to login:

```bash
npx -y firebase-tools login
```

### Command Line Options

- `--dir <absolute_dir_path>`: The absolute path of a directory containing `firebase.json` (or where you want to initialize `firebase.json`) to set a workspace context for the MCP server. If unspecified, the working directory where the server is started is used. The `{get|update}_project_environment` can be used to interactively change the project directory.
- `--only <feature1,feature2>`: A comma-separated list of feature groups to activate. Use this to limit the tools exposed to only features you are actively using.

## Tools

| Tool Name                        | Feature Group | Description                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| firebase_get_project             | core          | Retrieves information about the currently active Firebase project.                                                                                                                                                                                                         |
| firebase_list_apps               | core          | Retrieves apps registered in the current Firebase project.                                                                                                                                                                                                                 |
| firebase_get_admin_sdk_config    | core          | Gets the Admin SDK config for the current project.                                                                                                                                                                                                                         |
| firebase_get_sdk_config          | core          | Retrieves the Firebase SDK configuration information for the specified platform. You must specify either a platform or an app_id.                                                                                                                                          |
| firebase_create_project          | core          | Creates a new Firebase project.                                                                                                                                                                                                                                            |
| firebase_create_app              | core          | Creates a new app in your Firebase project for Web, iOS, or Android.                                                                                                                                                                                                       |
| firebase_create_android_sha      | core          | Adds a SHA certificate hash to an existing Android app.                                                                                                                                                                                                                    |
| firebase_get_environment         | core          | Retrieves information about the current Firebase environment including current authenticated user, project directory, active project, and more.                                                                                                                            |
| firebase_update_environment      | core          | Updates Firebase environment config such as project directory, active project, active user account, and more. Use `firebase_get_environment` to see the currently configured environment.                                                                                  |
| firebase_init                    | core          | Initializes selected Firebase features in the workspace. All features are optional; provide only the products you wish to set up. You can initialize new features into an existing project directory, but re-initializing an existing feature may overwrite configuration. |
| firestore_delete_document        | firestore     | Deletes a Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document.                                                                                                                            |
| firestore_get_documents          | firestore     | Retrieves one or more Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document.                                                                                                                |
| firestore_list_collections       | firestore     | Retrieves a list of collections from a Firestore database in the current project.                                                                                                                                                                                          |
| firestore_query_collection       | firestore     | Retrieves one or more Firestore documents from a collection is a database in the current project by a collection with a full document path. Use this if you know the exact path of a collection and the filtering clause you would like for the document.                  |
| firestore_get_rules              | firestore     | Retrieves the active Firestore security rules for the current project.                                                                                                                                                                                                     |
| firestore_validate_rules         | firestore     | Checks the provided Firestore Rules source for syntax and validation errors. Provide EITHER the source code to validate OR a path to a source file.                                                                                                                        |
| auth_get_user                    | auth          | Retrieves a user based on an email address, phone number, or UID.                                                                                                                                                                                                          |
| auth_disable_user                | auth          | Disables or enables a user based on a UID.                                                                                                                                                                                                                                 |
| auth_list_users                  | auth          | Retrieves all users in the project up to the specified limit.                                                                                                                                                                                                              |
| auth_set_claim                   | auth          | Sets a custom claim on a specific user's account. Use to create trusted values associated with a user e.g. marking them as an admin. Claims are limited in size and should be succinct in name and value. Specify ONLY ONE OF `value` or `json_value` parameters.          |
| auth_set_sms_region_policy       | auth          | Sets an SMS Region Policy for Firebase Auth to restrict the regions which can receive text messages based on an ALLOW or DENY list of country codes. This policy will override any existing policies when set.                                                             |
| dataconnect_list_services        | dataconnect   | List the Firebase Data Connect services available in the current project.                                                                                                                                                                                                  |
| dataconnect_get_schema           | dataconnect   | Retrieve information about the Firebase Data Connect Schema in the project, including Cloud SQL data sources and the GraphQL Schema describing the data model.                                                                                                             |
| dataconnect_get_connectors       | dataconnect   | Get the Firebase Data Connect Connectors in the project, which includes the pre-defined GraphQL queries accessible to client SDKs.                                                                                                                                         |
| dataconnect_execute_graphql      | dataconnect   | Executes an arbitrary GraphQL against a Data Connect service or its emulator.                                                                                                                                                                                              |
| dataconnect_execute_graphql_read | dataconnect   | Executes an arbitrary GraphQL query against a Data Connect service or its emulator. Cannot write data.                                                                                                                                                                     |
| dataconnect_execute_mutation     | dataconnect   | Executes a deployed Data Connect mutation against a service or its emulator. Can read and write data.                                                                                                                                                                      |
| dataconnect_execute_query        | dataconnect   | Executes a deployed Data Connect query against a service or its emulator. Cannot write any data.                                                                                                                                                                           |
| storage_get_rules                | storage       | Retrieves the active Storage security rules for the current project.                                                                                                                                                                                                       |
| storage_validate_rules           | storage       | Checks the provided Storage Rules source for syntax and validation errors. Provide EITHER the source code to validate OR a path to a source file.                                                                                                                          |
| storage_get_object_download_url  | storage       | Retrieves the download URL for an object in Firebase Storage.                                                                                                                                                                                                              |
| messaging_send_message           | messaging     | Sends a message to a Firebase Cloud Messaging registration token or topic. ONLY ONE of `registration_token` or `topic` may be supplied in a specific call.                                                                                                                 |
| remoteconfig_get_template        | remoteconfig  | Retrieves a remote config template for the project                                                                                                                                                                                                                         |
| remoteconfig_publish_template    | remoteconfig  | Publishes a new remote config template for the project                                                                                                                                                                                                                     |
| remoteconfig_rollback_template   | remoteconfig  | Rollback to a specific version of Remote Config template for a project                                                                                                                                                                                                     |
| crashlytics_list_top_issues      | crashlytics   | List the top crashes from crashlytics happening in the application.                                                                                                                                                                                                        |
