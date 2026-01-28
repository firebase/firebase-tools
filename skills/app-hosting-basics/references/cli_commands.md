# App Hosting CLI Commands

The Firebase CLI provides a comprehensive suite of commands to manage App Hosting resources. These commands are often faster and more scriptable than using the Firebase Console.

## Initialization
### `firebase init apphosting`
- **Purpose**: Sets up App Hosting in your local project.
- **Effect**:
  - Detects your web framework.
  - Creates/updates `apphosting.yaml`.
  - Can optionally create a backend if one doesn't exist.

## Backend Management
### `firebase apphosting:backends:create`
- **Purpose**: Creates a new App Hosting backend.
- **Usage**: `firebase apphosting:backends:create`
- **Interactive Prompts**:
  - Select location (e.g., `us-central1`).
  - Connect/Select GitHub repository.
  - Set root directory (if monorepo).
  - Set live branch (e.g., `main`).

### `firebase apphosting:backends:list`
- **Purpose**: Lists all backends in the current project.
- **Usage**: `firebase apphosting:backends:list`

### `firebase apphosting:backends:get <backend-id>`
- **Purpose**: Shows details for a specific backend.

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
- **Note**: Often handled automatically by `secrets:set`, but useful for debugging permission issues.
