//
// NOTE:
// The contents of this file are used to generate the JSON Schema documents in
// the schema/ directory. After changing this file you will need to run
// 'npm run generate:json-schema' to regenerate the schema files.
//

export type DatabaseConfig =
  | {
      rules?: string;
    }
  | {
      target?: string;
      instance?: string;
      rules: string;
    }[];

export type FirestoreConfig = {
  rules?: string;
  indexes?: string;
};

export type FunctionsConfig = {
  // TODO: Add types for "backend" and "runtime"
  source?: string;
  ignore?: string[];
  predeploy?: string[];
};

export type HostingConfig = {
  public: string;
  ignore?: string[];
  appAssociation?: string;
  cleanUrls?: boolean;
  trailingSlash?: boolean;
  postdeploy?: string;
  redirects?: {
    source: string;
    destination: string;
    type: number;
  }[];
  rewrites?: {
    source: string;
    destination?: string;
    function?: string;
    run?: {
      serviceId: string;
      region?: string;
    };
    dynamicLinks?: boolean;
  }[];
  headers?: {
    source: string;
    headers: {
      key: string;
      value: string;
    }[];
  }[];
  i18n?: {
    root: string;
  };
};

export type StorageConfig =
  | {
      rules: string;
    }
  | {
      bucket: string;
      rules: string;
    }[];

export type RemoteConfigConfig = {
  template: string;
};

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
