import * as schema from "./schema";
export type Schemas = schema.components["schemas"];
export type MfaEnrollment = Schemas["GoogleCloudIdentitytoolkitV1MfaEnrollment"];
export type MfaEnrollments = MfaEnrollment[];
export type CreateMfaEnrollmentsRequest = Schemas["GoogleCloudIdentitytoolkitV1MfaFactor"][];
