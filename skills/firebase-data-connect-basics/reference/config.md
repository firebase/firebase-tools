# Configuration Reference

## Contents
- [Project Structure](#project-structure)
- [dataconnect.yaml](#dataconnectyaml)
- [connector.yaml](#connectoryaml)
- [Firebase CLI Commands](#firebase-cli-commands)
- [Emulator](#emulator)
- [Deployment](#deployment)

---

## Project Structure

```
project-root/
├── firebase.json           # Firebase project config
└── dataconnect/
    ├── dataconnect.yaml    # Service configuration
    ├── schema/
    │   └── schema.gql      # Data model (types, relationships)
    └── connector/
        ├── connector.yaml  # Connector config + SDK generation
        ├── queries.gql     # Query operations
        └── mutations.gql   # Mutation operations (optional separate file)
```

---

## dataconnect.yaml

Main Data Connect service configuration:

```yaml
specVersion: "v1beta"
serviceId: "my-service"
location: "us-central1"
schema:
  source: "./schema"
  datasource:
    postgresql:
      database: "fdcdb"
      cloudSql:
        instanceId: "my-instance"
connectorDirs: ["./connector"]
```

| Field | Description |
|-------|-------------|
| `specVersion` | Always `"v1beta"` |
| `serviceId` | Unique identifier for the service |
| `location` | GCP region (us-central1, us-east4, europe-west1, etc.) |
| `schema.source` | Path to schema directory |
| `schema.datasource` | PostgreSQL connection config |
| `connectorDirs` | List of connector directories |

### Cloud SQL Configuration

```yaml
schema:
  datasource:
    postgresql:
      database: "my-database"      # Database name
      cloudSql:
        instanceId: "my-instance"  # Cloud SQL instance ID
```

---

## connector.yaml

Connector configuration and SDK generation:

```yaml
connectorId: "default"
generate:
  javascriptSdk:
    outputDir: "../web/src/lib/dataconnect"
    package: "@myapp/dataconnect"
  kotlinSdk:
    outputDir: "../android/app/src/main/kotlin/com/myapp/dataconnect"
    package: "com.myapp.dataconnect"
  swiftSdk:
    outputDir: "../ios/MyApp/DataConnect"
  dartSdk:
    outputDir: "../flutter/lib/dataconnect"
    package: myapp_dataconnect
```

### SDK Generation Options

| SDK | Fields |
|-----|--------|
| `javascriptSdk` | `outputDir`, `package` |
| `kotlinSdk` | `outputDir`, `package` |
| `swiftSdk` | `outputDir` |
| `dartSdk` | `outputDir`, `package` |
| `nodeAdminSdk` | `outputDir`, `package` (for Admin SDK) |

---

## Firebase CLI Commands

### Initialize Data Connect

```bash
# Interactive setup
firebase init dataconnect

# Set project
firebase use <project-id>
```

### Local Development

```bash
# Start emulator
firebase emulators:start --only dataconnect

# Start with database seed data
firebase emulators:start --only dataconnect --import=./seed-data

# Generate SDKs
firebase dataconnect:sdk:generate

# Watch for schema changes (auto-regenerate)
firebase dataconnect:sdk:generate --watch
```

### Schema Management

```bash
# Compare local schema to production
firebase dataconnect:sql:diff

# Generate SQL migration script
firebase dataconnect:sql:migrate --preview

# Apply migration
firebase dataconnect:sql:migrate
```

### Deployment

```bash
# Deploy Data Connect service
firebase deploy --only dataconnect

# Deploy specific connector
firebase deploy --only dataconnect:connector-id

# Deploy with schema migration
firebase deploy --only dataconnect --force
```

---

## Emulator

### Start Emulator

```bash
firebase emulators:start --only dataconnect
```

Default ports:
- Data Connect: `9399`
- PostgreSQL: `9939` (local PostgreSQL instance)

### Emulator Configuration (firebase.json)

```json
{
  "emulators": {
    "dataconnect": {
      "port": 9399
    }
  }
}
```

### Connect from SDK

```typescript
// Web
import { connectDataConnectEmulator } from 'firebase/data-connect';
connectDataConnectEmulator(dc, 'localhost', 9399);

// Android
connector.dataConnect.useEmulator("10.0.2.2", 9399)

// iOS
connector.useEmulator(host: "localhost", port: 9399)

// Flutter
connector.dataConnect.useDataConnectEmulator('localhost', 9399);
```

### Seed Data

Create seed data files and import:

```bash
# Export current emulator data
firebase emulators:export ./seed-data

# Start with seed data
firebase emulators:start --only dataconnect --import=./seed-data
```

---

## Deployment

### Deploy Workflow

1. **Test locally** with emulator
2. **Generate SQL diff**: `firebase dataconnect:sql:diff`
3. **Review migration**: Check breaking changes
4. **Deploy**: `firebase deploy --only dataconnect`

### Schema Migrations

Data Connect auto-generates PostgreSQL migrations:

```bash
# Preview migration
firebase dataconnect:sql:migrate --preview

# Apply migration (interactive)
firebase dataconnect:sql:migrate

# Force migration (non-interactive)
firebase dataconnect:sql:migrate --force
```

### Breaking Changes

Some schema changes require special handling:
- Removing required fields
- Changing field types
- Removing tables

Use `--force` flag to acknowledge breaking changes during deploy.

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy Data Connect
  run: |
    firebase deploy --only dataconnect --token ${{ secrets.FIREBASE_TOKEN }} --force
```

---

## VS Code Extension

Install "Firebase Data Connect" extension for:
- Schema intellisense and validation
- GraphQL operation testing
- Emulator integration
- SDK generation on save

### Extension Settings

```json
{
  "firebase.dataConnect.autoGenerateSdk": true,
  "firebase.dataConnect.emulator.port": 9399
}
```
