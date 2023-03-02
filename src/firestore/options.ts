import { FirebaseConfig } from "../firebaseConfig";

/**
 * The set of fields that the Firestore commands need from Options.
 * It is preferable that all codebases use this technique so that they keep
 * strong typing in their codebase but limit the codebase to have less to mock.
 */
export interface FirestoreOptions {
  project: string;
  database?: string;
  nonInteractive: boolean;
  allCollections?: boolean;
  shallow?: boolean;
  recursive?: boolean;
  force: boolean;
  pretty: boolean;
  config: {
    src: FirebaseConfig;
  };
  rc: {
    requireTarget(project: string, type: string, name: string): string[];
  };
  cwd?: string;
  configPath?: string;
  only?: string;
  except?: string;
}
