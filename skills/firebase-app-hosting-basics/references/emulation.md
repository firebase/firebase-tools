# App Hosting Emulation

You can test your App Hosting setup locally using the Firebase Local Emulator Suite. This allows you to verify your app's behavior with environment variables and secrets before deploying.

## Configuration: `apphosting.emulator.yaml`
This optional file overrides `apphosting.yaml` settings specifically for the local emulator. Use it to provide local secret values or override resource configs. If it contains sensitive values such as API keys, do not commit it to source control.

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

Or, if you are also using other emulators (Auth, Firestore, etc.):

```bash
firebase emulators:start
```

## Capabilities
- **Builds your app**: Runs the build command defined in your `package.json` to generate the serving artifact.
- **Serves locally**: Runs the app on `localhost:5004` (default). 
Configurable by setting `host` and `port` in the `emulators` block of `firebase.json`, like so: 

```json
{
  "emulators": {
    "apphosting": {
      "host": "localhost",
      "port": 5004
    }
  }
}
```
- **Env Var Injection**: Injects variables defined in `apphosting.yaml` and `apphosting.emulator.yaml` into the process.
