//
// NOTE:
// The contents of this file are used to generate the JSON Schema documents in
// the schema/ directory. After changing this file you will need to run
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

export type Deployable = {
  predeploy?: string | string[];
  postdeploy?: string | string[];
};

type DatabaseSingle = {
  rules: string;
} & Deployable;

type DatabaseMultiple = ({
  rules: string;
} & RequireAtLeastOne<{
  instance: string;
  target: string;
}> &
  Deployable)[];

type FirestoreSingle = {
  database?: string;
  location?: string;
  edition?: string;
  rules?: string;
  indexes?: string;
} & Deployable;

type FirestoreMultiple = ({
  rules?: string;
  indexes?: string;
} & RequireAtLeastOne<{
  database: string;
  target: string;
}> &
  Deployable)[];

export type HostingSource = { glob: string } | { source: string } | { regex: string };

export type HostingRedirects = HostingSource & {
  destination: string;
  type?: number;
};

export type DestinationRewrite = { destination: string };
export type LegacyFunctionsRewrite = { function: string; region?: string };
export type FunctionsRewrite = {
  function: {
    functionId: string;
    region?: string;
    pinTag?: boolean;
  };
};
export type RunRewrite = {
  run: {
    serviceId: string;
    region?: string;
    pinTag?: boolean;
  };
};
export type DynamicLinksRewrite = { dynamicLinks: boolean };
export type HostingRewrites = HostingSource &
  (
    | DestinationRewrite
    | LegacyFunctionsRewrite
    | FunctionsRewrite
    | RunRewrite
    | DynamicLinksRewrite
  );

export type HostingHeaders = HostingSource & {
  headers: {
    key: string;
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
  secrets?: string[];
  // Only allow a single region to be specified
  region?: string;
  // Invoker can only be public
  invoker?: "public";
}

export type HostingBase = {
  public?: string;
  source?: string;
  ignore?: string[];
  appAssociation?: "AUTO" | "NONE";
  cleanUrls?: boolean;
  trailingSlash?: boolean;
  redirects?: HostingRedirects[];
  rewrites?: HostingRewrites[];
  headers?: HostingHeaders[];
  i18n?: {
    root: string;
  };
  frameworksBackend?: FrameworksBackendOptions;
};

export type HostingSingle = HostingBase & {
  site?: string;
  target?: string;
} & Deployable;

// N.B. You would expect that a HostingMultiple is a HostingSingle[], but not
// quite. When you only have one hosting object you can omit both `site` and
// `target` because the default site will be looked up and provided for you.
// When you have a list of hosting targets, though, we require all configs
// to specify which site is being targeted.
// If you can assume we've resolved targets, you probably want to use
// HostingResolved, which says you must have site and may have target.
export type HostingMultiple = (HostingBase &
  RequireAtLeastOne<{
    site: string;
    target: string;
  }> &
  Deployable)[];

type StorageSingle = {
  rules: string;
  target?: string;
} & Deployable;

type StorageMultiple = ({
  rules: string;
  bucket: string;
  target?: string;
} & Deployable)[];

// Full Configs
export type DatabaseConfig = DatabaseSingle | DatabaseMultiple;

export type FirestoreConfig = FirestoreSingle | FirestoreMultiple;

export type IsolateConfig = {
  enabled: boolean;
  outputDir?: string;
  includeDevDependencies?: boolean;
};

type FunctionConfigBase = {
  // Optional: Directory containing the .env files for this codebase.
  // Defaults to the same directory as source if not specified.
  configDir?: string;
  // Optional: List of glob patterns for files and directories to ignore during deployment.
  // Uses gitignore-style syntax. Commonly includes node_modules, .git, etc.
  ignore?: string[];
  // Optional: The Node.js/Python runtime version to use for Cloud Functions.
  // Example: "nodejs20", "python312". Must be a supported runtime version.
  runtime?: ActiveRuntime;
  // Optional: A unique identifier for this functions codebase when using multiple codebases.
  // Must be unique across all codebases in firebase.json.
  codebase?: string;
  // Optional: Applies a prefix to all function IDs (and secret names) discovered for this codebase.
  // Must start with a lowercase letter; may contain lowercase letters, numbers, and dashes;
  // cannot start or end with a dash; maximum length 30 characters.
  prefix?: string;
} & Deployable;

export type LocalFunctionConfig = FunctionConfigBase & {
  // Directory containing the Cloud Functions source code.
  source: string;
  // Optional: When true, prevents the Firebase CLI from fetching and including legacy
  // Runtime Config values for this codebase during deployment. This has no effect on
  // remote sources, which never use runtime config. Defaults to false for backward compatibility.
  disallowLegacyRuntimeConfig?: boolean;
  // Forbid remoteSource when local source is provided
  remoteSource?: never;
  // Optional: Isolate workspace dependencies for pnpm monorepos.
  // When enabled, internal workspace dependencies are packed and included in the deployment.
  isolate?: IsolateConfig;
};

export type RemoteFunctionConfig = FunctionConfigBase & {
  // Deploy functions from a remote Git repository.
  remoteSource: {
    // The URL of the Git repository.
    repository: string;
    // The git ref (tag, branch, or commit hash) to deploy.
    ref: string;
    // The directory within the repository containing the functions source.
    dir?: string;
  };
  // Required for remote sources
  runtime: ActiveRuntime;
  // Forbid local source when remoteSource is provided
  source?: never;
};

export type FunctionConfig = LocalFunctionConfig | RemoteFunctionConfig;

export type FunctionsConfig = FunctionConfig | FunctionConfig[];

export type HostingConfig = HostingSingle | HostingMultiple;

export type StorageConfig = StorageSingle | StorageMultiple;

export type RemoteConfigConfig = {
  template: string;
} & Deployable;

export type EmulatorsConfig = {
  auth?: {
    host?: string;
    port?: number;
  };
  database?: {
    host?: string;
    port?: number;
  };
  firestore?: {
    host?: string;
    port?: number;
    websocketPort?: number;
  };
  functions?: {
    host?: string;
    port?: number;
  };
  hosting?: {
    host?: string;
    port?: number;
  };
  apphosting?: {
    host?: string;
    port?: number;
    startCommand?: string;
    /**
     * @deprecated
     */
    startCommandOverride?: string;
    rootDirectory?: string;
  };
  pubsub?: {
    host?: string;
    port?: number;
  };
  storage?: {
    host?: string;
    port?: number;
  };
  logging?: {
    host?: string;
    port?: number;
  };
  hub?: {
    host?: string;
    port?: number;
  };
  ui?: {
    enabled?: boolean;
    host?: string;
    port?: number;
  };
  extensions?: {};
  eventarc?: {
    host?: string;
    port?: number;
  };
  singleProjectMode?: boolean;
  dataconnect?: {
    host?: string;
    port?: number;
    postgresHost?: string;
    postgresPort?: number;
    dataDir?: string;
  };
  tasks?: {
    host?: string;
    port?: number;
  };
};

export type ExtensionsConfig = Record<string, string>;

export type DataConnectSingle = {
  // The directory containing dataconnect.yaml for this service
  source: string;
} & Deployable;

export type DataConnectMultiple = DataConnectSingle[];

export type DataConnectConfig = DataConnectSingle | DataConnectMultiple;

export type AppHostingSingle = {
  backendId: string;
  rootDir: string;
  ignore: string[];
  alwaysDeployFromSource?: boolean;
  localBuild?: boolean;
};

export type AppHostingMultiple = AppHostingSingle[];

export type AppHostingConfig = AppHostingSingle | AppHostingMultiple;

export type FirebaseConfig = {
  $schema?: string;
  database?: DatabaseConfig;
  firestore?: FirestoreConfig;
  functions?: FunctionsConfig;
  hosting?: HostingConfig;
  storage?: StorageConfig;
  remoteconfig?: RemoteConfigConfig;
  emulators?: EmulatorsConfig;
  extensions?: ExtensionsConfig;
  dataconnect?: DataConnectConfig;
  apphosting?: AppHostingConfig;
};
