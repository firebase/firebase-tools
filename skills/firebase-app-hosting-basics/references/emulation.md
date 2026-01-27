# App Hosting Emulation

You can test your App Hosting setup locally using the Firebase Local Emulator Suite. This allows you to verify your app's behavior with environment variables and secrets before deploying.

## Configuration: `apphosting.emulator.yaml`
This optional file overrides `apphosting.yaml` settings specifically for the local emulator. It is useful for using local secret values or different resource configs.

```yaml
# apphosting.emulator.yaml (gitignored usually)
runConfig:
  cpu: 1
  memoryMiB: 512

env:
  - variable: API_KEY
    value: "local-dev-api-key" # Override secret with local value
```

## Running the Emulator
To start the App Hosting emulator:

```bash
firebase emulators:start --only apphosting
```

Or, if you are using other emulators (Auth, Firestore, etc.):

```bash
firebase emulators:start
```

## Capabilities
- **Builds your app**: Runs the build command defined in your `package.json` to generate the serving artifact.
- **Serves locally**: Runs the app on `localhost:5004` (default).
- **Env Var Injection**: Injects variables defined in `apphosting.yaml` and `apphosting.emulator.yaml` into the process.
