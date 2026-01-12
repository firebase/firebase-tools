---
name: firebase-data-connect
description: Comprehensive guide for developing with Firebase Data Connect. Use this skill when users need to: (1) Provision a new Data Connect service, (2) Write Data Connect schemas (.gql files with @table), (3) Write queries and mutations, or (4) Generate and use typed SDKs.
---

# Firebase Data Connect

Firebase Data Connect maps GraphQL to Cloud SQL (PostgreSQL), providing typed interactions and local development tools.

## Project Structure & Configuration

```
dataconnect/
├── dataconnect.yaml      # Main service configuration. Required.
├── schema/
│   └── schema.gql        # GraphQL schema with @table definitions. Required.
└── connector/
    ├── connector.yaml    # Connector configuration. Required.
    ├── queries.gql       # Any .GQL files in this directory will be included in the connector.
    └── mutations.gql
```

### Service Configuration (`dataconnect.yaml`)

Defines the service, location, and database connection. Replace the values with your own.

```yaml
specVersion: "v1"
serviceId: "my-service"
location: "us-east4"
schema:
  source: "./schema"
  datasource:
    postgresql:
      database: "fdcdb"
      cloudSql:
        instanceId: "my-project-id:us-east4:my-instance"
connectorDirs: ["./connector"]
```

### Connector Configuration (`connector.yaml`)

Defines the connector ID and SDK generation settings.

```yaml
connectorId: "my-connector"
generate:
  javascriptSdk:
    outputDir: "../../js/generated"
    package: "@firebasegen/default-connector"
```

## Schema Definition (`schema.gql`)

Data Connect schemas use GraphQL syntax with the `@table` directive to map types to PostgreSQL tables.

### Key Concepts

*   **@table**: Helper directive to map a type to a table.
*   **@col**: Helper directive to customize column definition (e.g., `dataType`, `name`).
*   **@default**: Helper directive to set default values (e.g., `expr: "auth.uid"`, `expr: "request.time"`).
*   **Relationships**:
    *   **One-to-Many**: Define a field of the related type in the "Many" side table.
    *   **One-to-One**: Use `@unique` on the foreign key field.
    *   **Many-to-Many**: Create a join table with composite keys.


## Writing Schemas and Operations

Follow this iterative workflow to ensure correctness:

1.  **Write Schema**: Define your types in `schema/schema.gql`.
2.  **Validate Schema**: Run `firebase dataconnect:compile`.
    *   Fix any errors reported.
    *   Repeat until compilation succeeds.
3.  **Inspect Generated Types**: Read the contents of `.dataconnect/` to understand the generated type definitions.
4.  **Write Operations**: Create queries and mutations in `connector/` (e.g., `queries.gql`).
5.  **Validate Operations**: Run `firebase dataconnect:compile`.
    *   Fix any errors.
    *   Repeat until compilation succeeds.
6.  **Test**: Write unit tests to validate that each operation behaves as expected.

### Example GQL

See [schema_example.gql](references/schema_example.gql).

See [queries_example.gql](references/queries_example.gql) for examples of listing, filtering, and joining data.

See [mutations_example.gql](references/mutations_example.gql) for examples of creating, updating (upsert), and deleting data securely.

### Key Directives

*   **@auth(level: ...)**: Controls access level.
    *   `PUBLIC`: Accessible by anyone (requires `insecureReason`).
    *   `USER`: Accessible by any authenticated user.
    *   `USER_EMAIL_VERIFIED`: Accessible by potential verified users.
    *   `NO_ACCESS`: Admin only (internal use).
    *   **Note**: You can also use `id_expr: "auth.uid"` in filters/data to restrict access to the specific user.

## SDK Generation

Data Connect generates typed SDKs for your client apps (Web, Android, iOS, Dart).

1.  **Configure**: Ensure `connector.yaml` has the `generate` block (as shown above).
2.  **Generate**: Run `firebase dataconnect:sdk:generate`.
    *   Use `--watch` to auto-regenerate on changes.
3.  **Use in App**:
    *   Import the generated connector and operations.
    *   Call operation functions (e.g., `listMovies()`, `createMovie(...)`).
