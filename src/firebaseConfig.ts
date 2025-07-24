//
// NOTE:
// The contents of this file are used to generate the JSON Schema documents in
// the schema/ directory.
// Comments in /** */ this file become the description in the JSON schema - please treat them as public documentation.
// After changing this file you will need to run
// 'npm run generate:json-schema' to regenerate the schema files.
//

import type { HttpsOptions } from "firebase-functions/v2/https";
import { IngressSetting, MemoryOption, VpcEgressSetting } from "firebase-functions/v2/options";
import { ActiveRuntime } from "./deploy/functions/runtimes/supported/types";

/**
 * Creates a type that requires at least one key to be present in an interface
 * type. For example, RequireAtLeastOne<{ foo: string; bar: string }> can hold
 * a value of { foo: "a" }, { bar: "b" }, or { foo: "a", bar: "b" } but not {}
 * Sourced from - https://docs.microsoft.com/en-us/javascript/api/@azure/keyvault-certificates/requireatleastone?view=azure-node-latest
 */
export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

/**
 * Common configuration options for all Firebase products that can be deployed by the Firebase CLI.
 */
export type Deployable = {
  /**
   * A script or list of scripts that will be ran before this product is deployed.
   */
  predeploy?: string | string[];
  /**
   * A script or list of scripts that will be ran after this product is deployed.
   */
  postdeploy?: string | string[];
};

/**
 * Deployment options for a single Realtime Database instance.
 */
type DatabaseSingle = {
  /**
   * The rules files for this Realtime Database instance.
   */
  rules: string;
} & Deployable;

/**
 * Deployment options for a list of Realtime Database instancs.
 */
type DatabaseMultiple = ({
  /**
   * The rules files for this Realtime Database instance.
   */
  rules: string;
} & RequireAtLeastOne<{
  /**
   * The instance that this rules files is for.
   */
  instance: string;
  target: string;
}> &
  Deployable)[];

/**
 * Deployment options for a single Firestore database.
 */
type FirestoreSingle = {
  /**
   * The id of the Firestore database to deploy. If omitted, defaults to '(default)'
   */
  database?: string;
  /**
   * The region of the Firestore database to deploy. Required when 'database' is set.
   */
  location?: string;
  /**
   * Path to the firestore rules file
   */
  rules?: string;
  /**
   * Path to the firestore indexes file
   */
  indexes?: string;
} & Deployable;

/**
 * Deployment options for a list of Firestore databases.
 */
type FirestoreMultiple = ({
  /**
   * Path to the firestore rules file for this database
   */
  rules?: string;
  /**
   * Path to the firestore indexes file for this database
   */
  indexes?: string;
} & RequireAtLeastOne<{
  /**
   * The ID of the Firestore database to deploy. Required when deploying multiple Firestore databases.
   */
  database: string;
  /**
   * The deploy target these rules and indexes should be deployed to.
   * See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.
   */
  target: string;
}> &
  Deployable)[];

export type HostingSource =
  | {
      /** A glob pattern describing the paths that this setting should apply to. */
      glob: string;
    }
  | {
      /** A file path that this setting should apply to.*/
      source: string;
    }
  | {
      /** A regex pattern that matches the paths that this setting should apply to. **/
      regex: string;
    };

/**
 * URL redirects for a hosting site. Use these to prevent broken links when moving pages.
 */
export type HostingRedirects = HostingSource & {
  /**
   * The destination to redirect to.
   */
  destination: string;
  /**
   * The type of redirect.
   * Use 301 for 'Moved Permanently' or 302 for 'Found' (Temporary Redirect)
   */
  type?: 301 | 302;
};

/**
 * A simple rewrite from one path to another.
 */
export type DestinationRewrite = { destination: string };
/**
 * DEPRECATED: A Hosting rewrite to a Cloud Function.
 */
export type LegacyFunctionsRewrite = { function: string; region?: string };
/**
 * A Hosting rewrite to a Cloud Function.
 */
export type FunctionsRewrite = {
  function: {
    /** The ID of the Cloud Function to rewrite to. */
    functionId: string;
    /** The region of the Cloud Function to rewrite to. */
    region?: string;
    /**
     * If true, the rewrite will be pinned to the currently running version of the Cloud Function.
     * */
    pinTag?: boolean;
  };
};
/**
 * A Hosting rewrite to a Cloud Run service.
 */
export type RunRewrite = {
  run: {
    /** The ID of the Cloud Run service to rewrite to. */
    serviceId: string;
    /** The region of the Cloud Run service to rewrite to. */
    region?: string;
    /** If true, the rewrite will be pinned to the currently running revision of the Cloud Run service. */
    pinTag?: boolean;
  };
};

/**
 * DEPRECATED: A Hosting rewrite ot a Firebase Dynamic Link.
 */
export type DynamicLinksRewrite = { dynamicLinks: boolean };
/**
 * Defines a Hosting rewrite. Rewrites allow you to redirect URLs to a different path, Cloud function or Cloud Run service.
 */
export type HostingRewrites = HostingSource &
  (
    | DestinationRewrite
    | LegacyFunctionsRewrite
    | FunctionsRewrite
    | RunRewrite
    | DynamicLinksRewrite
  );

/**
 * Extra headers that should be sent when serving this path.
 */
export type HostingHeaders = HostingSource & {
  headers: {
    /**
     * The header to set.
     */
    key: string;
    /**
     * The value to set this header to.
     */
    value: string;
  }[];
};

// Allow only serializable options, since this is in firebase.json
// TODO(jamesdaniels) look into allowing serialized CEL expressions, params, and regexp
//                    and if we can build this interface automatically via Typescript silliness
interface FrameworksBackendOptions extends HttpsOptions {
  omit?: boolean;
  cors?: string | boolean;
  memory?: MemoryOption;
  timeoutSeconds?: number;
  minInstances?: number;
  maxInstances?: number;
  concurrency?: number;
  vpcConnector?: string;
  vpcConnectorEgressSettings?: VpcEgressSetting;
  serviceAccount?: string;
  ingressSettings?: IngressSetting;
  /** A list of secrets used in this app. */
  secrets?: string[];
  // Only allow a single region to be specified
  region?: string;
  // Invoker can only be public
  invoker?: "public";
}

export type HostingBase = {
  /**
   * Whether this site should publically available.
   */
  public?: string;
  /**
   * Path to the directory containing this site's source code. This will be archived and uploaded during deployment.
   */
  source?: string;
  /**
   * A list of paths or globs within the source directory that should not be included in the uploaded archive.
   */
  ignore?: string[];
  appAssociation?: "AUTO" | "NONE";
  cleanUrls?: boolean;
  trailingSlash?: boolean;
  /**
   * A list of redirects for this site.
   */
  redirects?: HostingRedirects[];
  /**
   * A list o rewrites for this site.
   */
  rewrites?: HostingRewrites[];
  /**
   * A list of extra headers to send when serving specific paths on this site.
   */
  headers?: HostingHeaders[];
  /**
   * Internationalization config for this site.
   * See https://firebase.google.com/docs/hosting/i18n-rewrites#set-up-i18n-rewrites
   * for instructions on how to enable interntionalization for your site.
   */
  i18n?: {
    /**
     * The directory containing internationalization rewrites.
     */
    root: string;
  };
  /**
   * Options for this sites web frameworks backend.
   */
  frameworksBackend?: FrameworksBackendOptions;
};

/**
 * Deployment options for a single Firebase Hosting site.
 */
export type HostingSingle = HostingBase & {
  /**
   * The site to deploy.
   */
  site?: string;
  /**
   * The deploy target to deploy.
   * See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.
   */
  target?: string;
} & Deployable;

/**
 * Deployment options for a list of Firebase Hosting sites.
 */
export type HostingMultiple = (HostingBase &
  RequireAtLeastOne<{
    /**
     * The site to deploy
     */
    site: string;
    /**
     * The deploy target to deploy.
     * See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.
     */
    target: string;
  }> &
  Deployable)[];

/**
 * Deployment options for a single Firebase storage bucket.
 */
type StorageSingle = {
  /**
   * Path to the rules files for this Firebase Storage bucket.
   */
  rules: string;
  /**
   * The deploy target to these Storage rules to.
   * See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.
   */
  target?: string;
} & Deployable;

/**
 * Deployment options for multiple Firebase storage buckets.
 */
type StorageMultiple = ({
  /**
   * Path to the rules files for this Firebase Storage bucket.
   */
  rules: string;
  /**
   * The Firebase Storage bucket that this config is for.
   */
  bucket: string;
  /**
   * The deploy target to these Storage rules to.
   * See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.
   */
  target?: string;
} & Deployable)[];

/**
 * A single or list of Realtime Database deployment configs
 */
export type DatabaseConfig = DatabaseSingle | DatabaseMultiple;

/**
 * A single or list of Firestore deployment configs
 */
export type FirestoreConfig = FirestoreSingle | FirestoreMultiple;

export type FunctionConfig = {
  /**
   * The directory containing your functions source code.
   * This directory will be archived and uploaded during deployment.
   * Files outside of this directory will not be included and should not be referenced from your functions code.
   */
  source?: string;
  /**
   * Files in the source directory that should not be uploaed during dpeloyment.
   */
  ignore?: string[];
  /**
   * The runtime these functions should use.
   */
  runtime?: ActiveRuntime;
  /**
   * The codebase that these functions are part of. You can use codebases to control which functions are deployed
   *  ie: `firebase deploy --only functions:my-codebase`
   */
  codebase?: string;
} & Deployable;

/**
 * A single or list of Cloud Functions for Firebase deployment configs
 */
export type FunctionsConfig = FunctionConfig | FunctionConfig[];

/**
 * A single or list of Firebase Hosting deployment configs
 */
export type HostingConfig = HostingSingle | HostingMultiple;

/**
 * A single or list of Firebase Storage deployment configs
 */
export type StorageConfig = StorageSingle | StorageMultiple;

/**
 * A Remote Config template to deploy.
 */
export type RemoteConfigConfig = {
  /**
   * A path to a CJSON file containing a Remote Config template.
   */
  template: string;
} & Deployable;

/**
 * Configures the host and port an emulator will be served. If omitted, the emulator suite will
 * automatically discover available ports.
 */
type EmulatorServingConfig = {
  /**
   * The host that this emulator will serve on.
   */
  host?: string;
  /**
   * The port that this emulator will serve on.
   */
  port?: number;
};

/**
 * Hosts, ports, and configuration options for the Firebase Emulator suite.
 */
export type EmulatorsConfig = {
  /**
   * Config for the Auth emulator
   */
  auth?: EmulatorServingConfig;
  /**
   * Config for the Realtime Database emulator
   */
  database?: EmulatorServingConfig;
  /**
   * Config for the Firestore emulator
   */
  firestore?: EmulatorServingConfig & {
    websocketPort?: number;
  };
  /**
   * Config for the Firebase Hosting emulator
   */
  hosting?: EmulatorServingConfig;
  /**
   * Config for the App Hosting emulator
   */
  apphosting?: EmulatorServingConfig & {
    /** The command that will be run to start your app when emulating your App Hosting backend */
    startCommand?: string;
    /**
     * @deprecated
     */
    startCommandOverride?: string;
    /** The root directory of your app. The start command will ran from this directory. */
    rootDirectory?: string;
  };
  /**
   * Config for the Pub/Sub emulator
   */
  pubsub?: EmulatorServingConfig;
  /**
   * Config for the Firebase Storage emulator
   */
  storage?: EmulatorServingConfig;
  /**
   * Config for the logging emulator.
   */
  logging?: EmulatorServingConfig;
  /**
   * Config for the emulator suite hub.
   */
  hub?: EmulatorServingConfig;
  /**
   * Config for the Emulator UI.
   */
  ui?: EmulatorServingConfig & {
    /**
     * If false, the Emulator UI will not be served.
     */
    enabled?: boolean;
  };
  /**
   * Placeholder - the Extensions emulator has no configuration options.
   */
  extensions?: {};
  /**
   * Config for the EventArc emulator.
   */
  eventarc?: EmulatorServingConfig;
  /**
   * If true, the Emulator Suite will only allow a single project to be used at a time.
   */
  singleProjectMode?: boolean;
  /**
   * Config for the Data Connect emulator.
   */
  dataconnect?: EmulatorServingConfig & {
    /**
     * Host for the Postgres database that backs the Data Connect emulator.
     */
    postgresHost?: string;
    /**
     * Port for the Postgres database that backs the Data Connect emulator.
     */
    postgresPort?: number;
    /**
     * The directory to persist emulator data to. If set, data will be saved between runs automatically.
     * If the --import flag is used, the current data will be overwritten by the imported data.
     */
    dataDir?: string;
  };
  /**
   * Config for the Cloud Tasks emulator.
   */
  tasks?: EmulatorServingConfig;
};

/**
 * The Firebase Extensions that should be deployed to this project.
 * This is a map of instance ID to extension reference (<publisherId>/<extensionId>@<version>)- ie:
 * "my-firestore-export": "firebase/firestore-bigquery-export@1.2.3"
 *
 * Version can also be a semver range.
 */
export type ExtensionsConfig = Record<string, string>;

/**
 * A single Data Connect deployment configs
 */
export type DataConnectSingle = {
  /** 
   * The directory containing dataconnect.yaml for this service
   */
  source: string;
} & Deployable;

/**
 * A list of Data Connect deployment configs
 */
export type DataConnectMultiple = DataConnectSingle[];

/**
 * A single or list of Data Connect deployment configs
 */
export type DataConnectConfig = DataConnectSingle | DataConnectMultiple;

/**
 * A single App Hosting deployment config
 */
export type AppHostingSingle = {
  /** 
   * The ID of the backend that should be deployed. 
   */
  backendId: string;
  /** 
   * The root directory of your app. This directory will be archived and uploaded during dpeloyment.
   */
  rootDir: string;
  /**
   * A list of file paths to exclude from the archive that is uploaded for this backend.
   */
  ignore: string[];
  /**
   * If true, this backend will only be deployed from local source, not from source control.
   */
  alwaysDeployFromSource?: boolean;
};

/**
 * A list of App Hosting deployment configs
 */
export type AppHostingMultiple = AppHostingSingle[];

/**
 * A single or list of App Hosting deployment configs
 */
export type AppHostingConfig = AppHostingSingle | AppHostingMultiple;

/**
 * Information about the resources in your Firebase project.
 * This used for declarative deployments via `firebase deploy` and local emulation via `firebase emulators:start`
 */
export type FirebaseConfig = {
  /**
   * The Realtime Database rules that should be deployed or emulated.
   */
  database?: DatabaseConfig;
  /**
   * The Firestore rules and indexes that should be deployed or emulated.
   */
  firestore?: FirestoreConfig;
  /**
   * The Cloud Functions for Firebase that should be deployed or emulated.
   */
  functions?: FunctionsConfig;
  /**
   * The Firebase Hosting site(s) that should be deployed or emulated.
   */
  hosting?: HostingConfig;
  /**
   * The Firebase Storage rules that should be deployed or emulated.
   */
  storage?: StorageConfig;
  /**
   * The Remote Config template(s) used by this project.
   */
  remoteconfig?: RemoteConfigConfig;
  /**
   * The Firebase Extension(s) that should be deployed or emulated.
   */
  extensions?: ExtensionsConfig;
  /**
   * The Data Connect service(s) that should be deployed or emulated.
   */
  dataconnect?: DataConnectConfig;
  /**
   * The App Hosting backend(s) that should be deployed or emulated.
   */
  apphosting?: AppHostingConfig;
  /**
   * Hosts, ports, and configuration options for the Firebase Emulator suite.
   */
  emulators?: EmulatorsConfig;
  /**
   * Unused. Included in schema so that the schema can be applied to single files.
   * @TJS-format uri
   */
  $schema?: string;
};
