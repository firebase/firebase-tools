# Remote Functions Configuration

When using remote function sources in Firebase, the remote repository must contain a `functions.yaml` file at the root of the functions directory. This file ensures that the remote source is a valid Firebase Functions project and provides necessary metadata.

## Required: functions.yaml

The remote repository must include a `functions.yaml` file in the root directory. This file can be minimal but must be valid YAML.

### Example functions.yaml

```yaml
# Minimal functions.yaml
specVersion: v1

# Optional metadata
metadata:
  name: "image-resizer"
  description: "Firebase Functions for resizing images"
  version: "1.0.0"

# Optional: Pre-built configuration
# If specified, the CLI will not run npm install or build commands
prebuilt: true

# Optional: Entry point (defaults to lib/index.js)
entryPoint: "lib/index.js"

# Optional: Runtime configuration
runtime: "nodejs18"
```

## Why functions.yaml is Required

1. **Security**: Prevents accidentally downloading and executing arbitrary code
2. **Validation**: Ensures the remote source is intended for Firebase Functions
3. **Performance**: When `prebuilt: true`, skips npm install and build steps
4. **Clarity**: Makes it explicit that a repository is designed to be used as a remote function source

## Using Remote Sources

In your `firebase.json`:

```json
{
  "functions": [
    {
      "remoteSource": {
        "repo": "https://github.com/firebase/functions-samples",
        "ref": "main"
      },
      "codebase": "image-processor"
    }
  ]
}
```

### Specifying a Subdirectory

For monorepos or repositories with multiple function codebases, you can specify a subdirectory:

```json
{
  "functions": [
    {
      "remoteSource": {
        "repo": "https://github.com/myorg/monorepo",
        "ref": "main",
        "path": "functions/image-processor"
      },
      "codebase": "image-processor"
    },
    {
      "remoteSource": {
        "repo": "https://github.com/myorg/monorepo",
        "ref": "main",
        "path": "functions/auth-handler"
      },
      "codebase": "auth-handler"
    }
  ]
}
```

The `path` must:
- Be relative (not start with `/`)
- Not contain `..` for security reasons
- Point to a directory containing `functions.yaml`

## Environment Variables

For remote sources, you can provide environment variables using:
- `.env.<codebase>` - Loaded for all deployments of this codebase
- `.env.<codebase>.<projectId>` - Loaded only when deploying to a specific project

These files should be placed in your project root (where firebase.json is located), not in the remote source.