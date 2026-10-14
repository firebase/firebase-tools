export const DEFAULT_SCHEMA = "public";
export const FIREBASE_SUPER_USER = "firebasesuperuser";
export const CLOUDSQL_SUPER_USER = "cloudsqlsuperuser";

export function firebaseowner(databaseId: string, schema: string = DEFAULT_SCHEMA) {
  return `firebaseowner_${databaseId}_${schema}`;
}

export function firebasereader(databaseId: string, schema: string = DEFAULT_SCHEMA) {
  return `firebasereader_${databaseId}_${schema}`;
}

export function firebasewriter(databaseId: string, schema: string = DEFAULT_SCHEMA) {
  return `firebasewriter_${databaseId}_${schema}`;
}

function createRoleBypassRLS(role: string, superuser: string): string {
  return `do
      $$
      begin
        if not exists (select FROM pg_catalog.pg_roles
          WHERE  rolname = '${role}') then
          CREATE ROLE "${role}" WITH ADMIN "${superuser}" BYPASSRLS;
        else
          ALTER ROLE "${role}" BYPASSRLS;
        end if;
      end
      $$
    ;`;
}

// Creates the owner role, modifies schema owner to firebaseowner.
export function ownerRolePermissions(
  databaseId: string,
  superuser: string,
  schema: string,
): string[] {
  const firebaseOwnerRole = firebaseowner(databaseId, schema);
  return [
    createRoleBypassRLS(firebaseOwnerRole, superuser),

    // Revoke reverse membership first to avoid SQLSTATE 0LP01 circular role membership errors
    // on existing databases, then grant cloudsqlsuperuser to firebaseowner so developer
    // migrations have full DDL privileges without owning firebasesuperuser system objects.
    // firebasesuperuser retains direct membership via WITH ADMIN from CREATE ROLE.
    `REVOKE "${firebaseOwnerRole}" FROM "${CLOUDSQL_SUPER_USER}"`,
    `GRANT "${CLOUDSQL_SUPER_USER}" TO "${firebaseOwnerRole}"`,

    `CREATE SCHEMA IF NOT EXISTS "${schema}" AUTHORIZATION "${firebaseOwnerRole}"`,
    `ALTER SCHEMA "${schema}" OWNER TO "${firebaseOwnerRole}"`,
    `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
    `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
    `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
  ];
}

// The SQL permissions required for a role to read/write the FDC databases.
// Requires the firebase_owner_* role to be the owner of the schema for default permissions.
export function writerRolePermissions(
  databaseId: string,
  superuser: string,
  schema: string,
): string[] {
  const firebaseWriterRole = firebasewriter(databaseId, schema);
  return [
    createRoleBypassRLS(firebaseWriterRole, superuser),

    `GRANT "${firebaseWriterRole}" TO "${CLOUDSQL_SUPER_USER}"`,

    `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseWriterRole}"`,

    // Grant writer role SELECT, INSERT, UPDATE, DELETE on all tables
    // (You might want to exclude certain sensitive tables)
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,

    // Grant writer usage on sequences for nextval() in inserts
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,

    // Grant execution on function which could be needed by some extensions.
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,
  ];
}

// The SQL permissions required for a role to read the FDC databases.
// Requires the firebase_owner_* role to be the owner of the schema for default permissions.
export function readerRolePermissions(
  databaseId: string,
  superuser: string,
  schema: string,
): string[] {
  const firebaseReaderRole = firebasereader(databaseId, schema);
  return [
    createRoleBypassRLS(firebaseReaderRole, superuser),

    `GRANT "${firebaseReaderRole}" TO "${CLOUDSQL_SUPER_USER}"`,

    `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseReaderRole}"`,

    `GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,

    // Grant reader usage on sequences for nextval()
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,

    // Grant execution on function which could be needed by some extensions.
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,
  ];
}

// Gives firebase reader and writer roles ability to see tables created by other owners in a given schema.
export function defaultPermissions(databaseId: string, schema: string, ownerRole: string) {
  const firebaseWriterRole = firebasewriter(databaseId, schema);
  const firebaseReaderRole = firebasereader(databaseId, schema);
  return [
    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${firebaseWriterRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT USAGE ON SEQUENCES TO "${firebaseWriterRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT EXECUTE ON FUNCTIONS TO "${firebaseWriterRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT SELECT ON TABLES TO "${firebaseReaderRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT USAGE ON SEQUENCES TO "${firebaseReaderRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT EXECUTE ON FUNCTIONS TO "${firebaseReaderRole}";`,
  ];
}
