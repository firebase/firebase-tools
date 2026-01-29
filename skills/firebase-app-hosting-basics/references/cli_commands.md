# App Hosting CLI Commands

The Firebase CLI provides a comprehensive suite of commands to manage App Hosting resources. These commands are often faster and more scriptable than using the Firebase Console.

## Initialization
### `firebase init apphosting`
- **Purpose**: Interactive command that sets up App Hosting in your local project. 
It is recommended to not use this command and instead manually write a 'firebase.json' file with an 'apphosting' block.
- **Effect**:
  - Detects your web framework.
  - Creates/updates `apphosting.yaml`.
  - Can optionally create a backend if one doesn't exist.

## Backend Management
### `firebase apphosting:backends:create`
- **Purpose**: Creates a new App Hosting backend. Use this when setting up automated deployments via GitHub.
- **Options**:
  - `--app <webAppId>`: The ID of an existing Firebase web app to associate with the backend.
  - `--backend <backenId>`: The ID of the new backend.
  - `--primary-region <location>`: The primary region for the backend.
  - `--root-dir <rootDir>`: The root directory for the backend. If omitted, defaults to the root directory of the project.
  - `--service-account <service-account>`: The service account used to run the server. If omitted, defaults to the default service account.

### `firebase apphosting:backends:list`
- **Purpose**: Lists all backends in the current project.
- **Options**: `firebase apphosting:backends:list`

### `firebase apphosting:backends:get <backend-id>`
- **Purpose**: Shows details for a specific backend.
- **Options**: `firebase apphosting:backends:get <backend-id>`

### `firebase apphosting:backends:delete <backend-id>`
- **Purpose**: Deletes a backend and its associated resources.

## Rollouts (Deployment)
### `firebase apphosting:rollouts:create <backend-id>`
- **Purpose**: Manually triggers a new rollout (deployment).
- **Options**:
  - `--git-branch <branch>`: Deploy the latest commit from a specific branch.
  - `--git-commit <commit-hash>`: Deploy a specific commit.
- **Use Case**: Useful for redeploying without code changes, or rolling back to a specific commit.

### `firebase apphosting:rollouts:list <backend-id>`
- **Purpose**: Lists the history of rollouts for a backend.

## Secrets Management
App Hosting uses Cloud Secret Manager to securely handle sensitive environment variables (like API keys).

### `firebase apphosting:secrets:set <secret-name>`
- **Purpose**: Creates or updates a secret in Cloud Secret Manager and makes it available to App Hosting.
- **Behavior**: Prompts for the secret value (hidden input).

### `firebase apphosting:secrets:grantaccess <secret-name>`
- **Purpose**: Grants the App Hosting service account permission to access the secret.
- **Note**: Often handled automatically by `secrets:set`, but useful for debugging permission issues or granting access to existing secrets.
