"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultPermissions = exports.readerRolePermissions = exports.writerRolePermissions = exports.ownerRolePermissions = exports.firebasewriter = exports.firebasereader = exports.firebaseowner = exports.CLOUDSQL_SUPER_USER = exports.FIREBASE_SUPER_USER = exports.DEFAULT_SCHEMA = void 0;
exports.DEFAULT_SCHEMA = "public";
exports.FIREBASE_SUPER_USER = "firebasesuperuser";
exports.CLOUDSQL_SUPER_USER = "cloudsqlsuperuser";
function firebaseowner(databaseId, schema = exports.DEFAULT_SCHEMA) {
    return `firebaseowner_${databaseId}_${schema}`;
}
exports.firebaseowner = firebaseowner;
function firebasereader(databaseId, schema = exports.DEFAULT_SCHEMA) {
    return `firebasereader_${databaseId}_${schema}`;
}
exports.firebasereader = firebasereader;
function firebasewriter(databaseId, schema = exports.DEFAULT_SCHEMA) {
    return `firebasewriter_${databaseId}_${schema}`;
}
exports.firebasewriter = firebasewriter;
// Creates the owner role, modifies schema owner to firebaseowner.
function ownerRolePermissions(databaseId, superuser, schema) {
    const firebaseOwnerRole = firebaseowner(databaseId, schema);
    return [
        `do
      $$
      begin
        if not exists (select FROM pg_catalog.pg_roles
          WHERE  rolname = '${firebaseOwnerRole}') then
          CREATE ROLE "${firebaseOwnerRole}" WITH ADMIN "${superuser}";
        end if;
      end
      $$
    ;`,
        // We grant owner to cloudsqlsuperuser because only the owner can alter the schema owner.
        // It's also needed for the reader and write roles setup as only owner can alter schema defaults.
        `GRANT "${firebaseOwnerRole}" TO "cloudsqlsuperuser"`,
        `ALTER SCHEMA "${schema}" OWNER TO "${firebaseOwnerRole}"`,
        `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
        `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
        `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
    ];
}
exports.ownerRolePermissions = ownerRolePermissions;
// The SQL permissions required for a role to read/write the FDC databases.
// Requires the firebase_owner_* role to be the owner of the schema for default permissions.
function writerRolePermissions(databaseId, superuser, schema) {
    const firebaseWriterRole = firebasewriter(databaseId, schema);
    return [
        `do
      $$
      begin
        if not exists (select FROM pg_catalog.pg_roles
          WHERE  rolname = '${firebaseWriterRole}') then
          CREATE ROLE "${firebaseWriterRole}" WITH ADMIN "${superuser}";
        end if;
      end
      $$
    ;`,
        `GRANT "${firebaseWriterRole}" TO "cloudsqlsuperuser"`,
        `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseWriterRole}"`,
        // Grant writer role SELECT, INSERT, UPDATE, DELETE on all tables
        // (You might want to exclude certain sensitive tables)
        `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,
        // Grant writer usage on sequences for nextval() in inserts
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,
        // Grant execution on function which could be needed by some extensions.
        `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,
    ];
}
exports.writerRolePermissions = writerRolePermissions;
// The SQL permissions required for a role to read the FDC databases.
// Requires the firebase_owner_* role to be the owner of the schema for default permissions.
function readerRolePermissions(databaseId, superuser, schema) {
    const firebaseReaderRole = firebasereader(databaseId, schema);
    return [
        `do
      $$
      begin
        if not exists (select FROM pg_catalog.pg_roles
          WHERE  rolname = '${firebaseReaderRole}') then
          CREATE ROLE "${firebaseReaderRole}" WITH ADMIN "${superuser}";
        end if;
      end
      $$
    ;`,
        `GRANT "${firebaseReaderRole}" TO "cloudsqlsuperuser"`,
        `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseReaderRole}"`,
        `GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,
        // Grant reader usage on sequences for nextval()
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,
        // Grant execution on function which could be needed by some extensions.
        `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,
    ];
}
exports.readerRolePermissions = readerRolePermissions;
// Gives firebase reader and writer roles ability to see tables created by other owners in a given schema.
function defaultPermissions(databaseId, schema, ownerRole) {
    const firebaseWriterRole = firebasewriter(databaseId, schema);
    const firebaseReaderRole = firebasereader(databaseId, schema);
    return [
        `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO "${firebaseWriterRole}";`,
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
exports.defaultPermissions = defaultPermissions;
//# sourceMappingURL=permissions.js.map