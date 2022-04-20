//
// NOTE:
// The contents of this file are used to generate the JSON Schema documents in
// the schema/ directory. After changing this file you will need to run
// 'npm run generate:json-schema' to regenerate the schema files.
//

// Sourced from - https://docs.microsoft.com/en-us/javascript/api/@azure/keyvault-certificates/requireatleastone?view=azure-node-latest
type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

// should be sourced from - https://github.com/firebase/firebase-tools/blob/master/src/deploy/functions/runtimes/index.ts#L15
type CloudFunctionRuntimes = "nodejs10" | "nodejs12" | "nodejs14" | "nodejs16";

type Deployable = {
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

type HostingSource = { glob: string } | { source: string } | { regex: string };

type HostingRedirects = HostingSource & {
  destination: string;
  type?: number;
};

export type HostingRewrites = HostingSource &
  (
    | { destination: string }
    | { function: string; region?: string }
    | {
        run: {
          serviceId: string;
          region?: string;
        };
      }
    | { dynamicLinks: boolean }
  );

export type HostingHeaders = HostingSource & {
  headers: {
    key: string;
    value: string;
  }[];
};

type HostingBase = {
  public?: string;
  ignore?: string[];
  appAssociation?: string;
  cleanUrls?: boolean;
  trailingSlash?: boolean;
  redirects?: HostingRedirects[];
  rewrites?: HostingRewrites[];
  headers?: HostingHeaders[];
  i18n?: {
    root: string;
  };
};

type HostingSingle = HostingBase & {
  site?: string;
  target?: string;
} & Deployable;

type HostingMultiple = (HostingBase &
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

export type FirestoreConfig = {
  rules?: string;
  indexes?: string;
} & Deployable;

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
};

export type ExtensionsConfig = Record<string, string>;

export type FirebaseConfig = {
  database?: DatabaseConfig;
  firestore?: FirestoreConfig;
  functions?: FunctionsConfig;
  hosting?: HostingConfig;
  storage?: StorageConfig;
  remoteconfig?: RemoteConfigConfig;
  emulators?: EmulatorsConfig;
  extensions?: ExtensionsConfig;
};
