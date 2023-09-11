import { Options } from "../options";
import * as types from "../firestore/api-types";

/**
 * The set of fields that the Firestore commands need from Options.
 * It is preferable that all codebases use this technique so that they keep
 * strong typing in their codebase but limit the codebase to have less to mock.
 */
export interface FirestoreOptions extends Options {
  project: string;
  database?: string;
  nonInteractive: boolean;
  allCollections?: boolean;
  shallow?: boolean;
  recursive?: boolean;
  location?: string;
  type?: types.DatabaseType;
  deleteProtection?: types.DatabaseDeleteProtectionStateOption;
}
