import * as schema from "./schema";
export type Schemas = schema.components["schemas"];
export type MfaEnrollment = Schemas["GoogleCloudIdentitytoolkitV1MfaEnrollment"] & {
  // Emulator only: the base32 shared secret of a TOTP enrollment. It is kept on
  // the enrollment so that export and import carry it, but it is never sent to
  // clients (see redactTotpSecrets in totp.ts). The name must stay camelCase
  // because request bodies are normalized with camelCase().
  emulatorTotpSecret?: string;
};
export type MfaEnrollments = MfaEnrollment[];
