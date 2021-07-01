//
// NOTE:
// The contents of this file are used to generate the JSON Schema documents in
// the schema/ directory. After changing this file you will need to run
// 'npm run generate:json-schema' to regenerate the schema files.
//

// should be sourced from https://github.com/firebase/firebase-tools/blob/master/src/deploy/functions/runtimes/index.ts#L15
type CloudFunctionRuntimes = "nodejs10" | "nodejs12" | "nodejs14";

type Deployable = {
  predeploy?: string | string[];
  postdeploy?: string | string[];
};

type DatabaseSingle = {
  rules: string;
} & Deployable;

type DatabaseMultiple = ({
  rules: string;
} & (
  | {
      instance: string;
      target?: string;
    }
  | {
      instance?: string;
      target: string;
    }
) &
  Deployable)[];

type HostingRedirects = ({ source: string } | { regex: string }) & {
  destination: string;
  type: number;
};

type HostingRewrites = ({ source: string } | { regex: string }) &
  (
    | { destination: string }
    | { function: string }
    | {
        run: {
          serviceId: string;
          region?: string;
        };
      }
    | { dynamicLinks: boolean }
  );

type HostingHeaders = ({ source: string } | { regex: string }) & {
  headers: {
    key: string;
    value: string;
  }[];
};

type HostingBase = {
  public: string;
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

type HostingSingle = HostingBase &
  Deployable & {
    site?: string;
    target?: string;
  };

type HostingMultiple = (HostingBase &
  Deployable &
  (
    | {
        site: string;
        target?: string;
      }
    | {
        site?: string;
        target: string;
      }
  ))[];

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

export type FunctionsConfig = {
  // TODO: Add types for "backend"
  source?: string;
  ignore?: string[];
  runtime?: CloudFunctionRuntimes;
} & Deployable;

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
};

export type FirebaseConfig = {
  database?: DatabaseConfig;
  firestore?: FirestoreConfig;
  functions?: FunctionsConfig;
  hosting?: HostingConfig;
  storage?: StorageConfig;
  remoteconfig?: RemoteConfigConfig;
  emulators?: EmulatorsConfig;
};
