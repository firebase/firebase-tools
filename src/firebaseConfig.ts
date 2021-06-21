export type DatabaseConfig =
  | {
      rules: string;
    }
  | {
      target?: string;
      instance?: string;
      rules: string;
    }[];

export type FirestoreConfig = {
  rules: string;
  indexes: string;
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
    port?: string;
  };
  database?: {
    host?: string;
    port?: string;
  };
  firestore?: {
    host?: string;
    port?: string;
  };
  functions?: {
    host?: string;
    port?: string;
  };
  hosting?: {
    host?: string;
    port?: string;
  };
  pubsub?: {
    host?: string;
    port?: string;
  };
  storage?: {
    host?: string;
    port?: string;
  };
  logging?: {
    host?: string;
    port?: string;
  };
  hub?: {
    host?: string;
    port?: string;
  };
  ui?: {
    enabled?: boolean;
    host?: string;
    port?: string;
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
