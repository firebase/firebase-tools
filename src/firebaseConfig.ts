//
// NOTE:
// The contents of this file are used to generate the JSON Schema documents in
// the schema/ directory. After changing this file you will need to run
// 'npm run generate:json-schema' to regenerate the schema files.
//
import { RequireAtLeastOne } from "./metaprogramming";
import type { HttpsOptions } from "firebase-functions/v2/https";
import { IngressSetting, MemoryOption, VpcEgressSetting } from "firebase-functions/v2/options";
// Sourced from - https://docs.microsoft.com/en-us/javascript/api/@azure/keyvault-certificates/requireatleastone?view=azure-node-latest

// should be sourced from - https://github.com/firebase/firebase-tools/blob/master/src/deploy/functions/runtimes/index.ts#L15
type CloudFunctionRuntimes =
  | "nodejs10"
  | "nodejs12"
  | "nodejs14"
  | "nodejs16"
  | "nodejs18"
  | "nodejs20";

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

export type FunctionConfig = {
  source?: string;
  ignore?: string[];
  runtime?: CloudFunctionRuntimes;
  codebase?: string;
} & Deployable;

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
  pubsub?: {
    host?: string;
    port?: number;
  };
  storage?: {
    host?: string;
    port?: number;
  };
  remoteconfig?: {
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
    port?: number | string;
  };
  extensions?: {};
  eventarc?: {
    host?: string;
    port?: number;
  };
  singleProjectMode?: boolean;
};

export type ExtensionsConfig = Record<string, string>;

export type FirebaseConfig = {
  /**
   * @TJS-format uri
   */
  $schema?: string;
  database?: DatabaseConfig;
  firestore?: FirestoreConfig;
  functions?: FunctionsConfig;
  hosting?: HostingConfig;
  storage?: StorageConfig;
  remoteconfig?: RemoteConfigConfig;
  emulators?: EmulatorsConfig;
  extensions?: ExtensionsConfig;
};
