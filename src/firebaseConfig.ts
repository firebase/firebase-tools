//
// NOTE:
// The contents of this file are used to generate the JSON Schema documents in
// the schema/ directory. After changing this file you will need to run
// 'npm run generate:json-schema' to regenerate the schema files.
//

// Sourced from - https://firebase.google.com/docs/hosting/full-config#rewrite-cloud-run-container
type CloudRunRegions =
  | "asia-east1"
  | "asia-east2"
  | "asia-northeast1"
  | "asia-northeast2"
  | "asia-northeast3"
  | "asia-south1"
  | "asia-southeast1"
  | "asia-southeast2"
  | "australia-southeast1"
  | "europe-north1"
  | "europe-west1"
  | "europe-west2"
  | "europe-west3"
  | "europe-west4"
  | "europe-west6"
  | "northamerica-northeast1"
  | "southamerica-east1"
  | "us-central1"
  | "us-east1"
  | "us-east4"
  | "us-west1";

type CloudFunctionRuntimes = "nodejs10" | "nodejs12" | "nodejs14";

type DeployAsset = {
  predeploy?: string | string[];
  postdeploy?: string | string[];
};

type DatabaseOne = {
  rules: string;
} & DeployAsset;

type DatabaseMany = ({
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
  DeployAsset)[];

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
          region?: CloudRunRegions;
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

type HostingOne = HostingBase &
  DeployAsset & {
    site?: string;
    target?: string;
  };

type HostingMany = (HostingBase &
  DeployAsset &
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

type StorageOne = {
  rules: string;
  target?: string;
} & DeployAsset;

type StorageMany = ({
  rules: string;
  bucket: string;
  target?: string;
} & DeployAsset)[];

// Full Configs
export type DatabaseConfig = DatabaseOne | DatabaseMany;

export type FirestoreConfig = {
  rules?: string;
  indexes?: string;
} & DeployAsset;

export type FunctionsConfig = {
  // TODO: Add types for "backend"
  source?: string;
  ignore?: string[];
  runtime?: CloudFunctionRuntimes;
} & DeployAsset;

export type HostingConfig = HostingOne | HostingMany;

export type StorageConfig = StorageOne | StorageMany;

export type RemoteConfigConfig = {
  template: string;
} & DeployAsset;

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
