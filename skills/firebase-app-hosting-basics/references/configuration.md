# App Hosting Configuration (`apphosting.yaml`)

The `apphosting.yaml` file is the source of truth for your backend's configuration. It must be located in the root of your app's directory (or the specific root directory if using a monorepo).

## File Structure

```yaml
# apphosting.yaml

# Cloud Run service configuration
runConfig:
  cpu: 1
  memoryMiB: 512
  minInstances: 0
  maxInstances: 100
  concurrency: 80

# Environment variables
env:
  - variable: STORAGE_BUCKET
    value: mybucket.app
    availability:
      - BUILD
      - RUNTIME
  - variable: API_KEY
    secret: myApiKeySecret
```

## `runConfig`
Controls the resources allocated to the Cloud Run service that serves your app.
- `cpu`: Number of vCPUs. Note: If `< 1`, concurrency MUST be set to `1`.
- `memoryMiB`: RAM in MiB (128 to 32768).
- `minInstances`: Minimum containers to keep warm (default 0). Set to >= 1 to avoid cold starts.
- `maxInstances`: Maximum scaling limit (default 100).
- `concurrency`: Max concurrent requests per instance (default 80).

### Resource Constraints
- **CPU vs Memory**: Higher memory often requires higher CPU.
  - > 4GiB RAM -> Needs >= 2 vCPU
  - > 8GiB RAM -> Needs >= 4 vCPU

## `env` (Environment Variables)
Defines environment variables available during build and/or runtime.

- `variable`: The name of the env var (e.g., `NEXT_PUBLIC_API_URL`).
- `value`: A literal string value.
- `secret`: The name of a secret in Cloud Secret Manager. use `firebase apphosting:secrets:set` to create these.
- `availability`: Where the variable is needed.
  - `BUILD`: Available during the `npm run build` process.
  - `RUNTIME`: Available when the app is serving requests.
  - Defaults to both if not specified.
