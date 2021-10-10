/* eslint-disable jsdoc/check-tag-names */
//
// NOTE:
// The contents of this file are used to generate the JSON Schema documents in
// the schema/ directory. After changing this file you will need to run
// 'npm run generate:json-schema' to regenerate the schema files.
//

/**
 * Integer type
 *
 * @see https://github.com/YousefED/typescript-json-schema#integer-type-alias
 */
type integer = number;

export type DatabaseConfig =
  | {
      /**
       * Points to the file that contains security rules for your Realtime Database
       */
      rules?: string;
    }
  | {
      /**
       * Define a database target name to which you apply your security rules file
       */
      target?: string;

      /**
       * TODO
       */
      instance?: string;

      /**
       * Points to the file that contains Realtime Database security rules
       */
      rules: string;
    }[];

/**
 * Firestore configuration
 */
export type FirestoreConfig = {
  /**
   * Points to the file that contains security rules for Firestore
   */
  rules?: string;

  /**
   * Points to the file that defines indexes for Firestore
   */
  indexes?: string;
};

export type FunctionsConfig = {
  // TODO: Add types for "backend" and "runtime"
  /**
   * Functions' source path
   *
   * @examples ./src
   */
  source?: string;

  /**
   * A list of globs to be ignored
   */
  ignore?: string[];

  /**
   * Pre-deploy lifecycle hook. Commands in the string array are sequentially executed. If any one of them fails the function will not deploy and the postdeploy lifecycle hook will not run
   */
  predeploy?: string[];

  /**
   * Post-deploy lifecycle hook will only execute if pre-deploy and function deployment completed successfully
   */
  postdeploy?: string[];
};

type HostingHttpRedirectConfig = {
  /**
   * A glob pattern that is matched against all URL paths at the start of every request
   */
  source: string;
  /**
   * The value used within the Location header entry
   */
  destination: string;
  /**
   * The redirect status code
   *
   * @enum [301, 302]
   * @examples 301, 302
   */
  type: integer;
};

/**
 * A redirect item
 */
type HostingRewriteConfig = {
  /**
   * A glob specifying a rewrite rule
   */
  source: string;

  /**
   * A local destination
   */
  destination?: string;

  function?: string;

  run?: {
    serviceId: string;
    region?: string;
  };

  dynamicLinks?: boolean;
};

type HostingHeaderConfig = {
  /**
   * Matched against the original request path, regardless of rewrite rules
   */
  source: string;

  /**
   * The header object
   */
  headers: {
    /**
     * The header key
     */
    key: string;

    /**
     * The header value
     */
    value: string;
  }[];
};

export type HostingConfig = {
  /**
   * The directory that gets uploaded to Firebase
   *
   * @default public
   */
  public: string;

  /**
   * A list of globs to be ignored on deploy
   */
  ignore?: string[];

  /**
   * @default AUTO
   */
  appAssociation?: string;

  /**
   * Controls whether URLs should have the file extension
   */
  cleanUrls?: boolean;

  /**
   * Controls whether URLs should have trailing slashes or not
   */
  trailingSlash?: boolean;

  /**
   * Script to run before deploy
   */
  predeploy?: string;

  /**
   * Script to run after deploy
   */
  postdeploy?: string;

  /**
   * Specifies all http redirects
   */
  redirects?: HostingHttpRedirectConfig[];

  /**
   * Holds rules for rewrites
   */
  rewrites?: HostingRewriteConfig[];

  /**
   * An array of custom header definitions
   */
  headers?: HostingHeaderConfig[];

  i18n?: {
    root: string;
  };

  /**
   * Hosting target
   * Deploy targets are short-name identifiers (that you define yourself) for Firebase resources in your Firebase project,
   * like a Hosting site with unique static assets or a group of Realtime Database instances
   * that share the same security rules.
   *
   * To create a deploy target and apply a target-name to a Hosting site, run the following CLI command:
   * `firebase target:apply <type> <target-name> <resource-name>`
   *
   * @see https://firebase.google.com/docs/cli/targets
   */
  target?: string;
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
    /**
     * Port to listen
     *
     * @default 3000
     */
    port?: integer;
  };
  database?: {
    host?: string;
    /**
     * Port to listen
     */
    port?: integer;
  };
  firestore?: {
    host?: string;
    /**
     * Port to listen
     *
     * @default 8080
     */
    port?: integer;
  };
  functions?: {
    host?: string;
    /**
     * Port to listen
     *
     * @default 5001
     */
    port?: integer;
  };
  hosting?: {
    host?: string;
    /**
     * Port to listen
     *
     * @default 5000
     */
    port?: integer;
  };
  pubsub?: {
    host?: string;
    /**
     * Port to listen
     *
     * @default 8085
     */
    port?: integer;
  };
  storage?: {
    host?: string;
    /**
     * Port to listen
     */
    port?: integer;
  };
  logging?: {
    host?: string;
    /**
     * Port to listen
     */
    port?: integer;
  };
  hub?: {
    host?: string;
    /**
     * Port to listen
     */
    port?: integer;
  };
  ui?: {
    /**
     * @default true
     */
    enabled?: boolean;

    /**
     * @default localhost
     */
    host?: string;

    /**
     * Port to listen
     *
     * @default 4000
     */
    port?: integer | string;
  };
};

/**
 * JSON schema for Firebase configuration file
 */
export type FirebaseConfig = {
  database?: DatabaseConfig;

  /**
   * Firestore configuration
   */
  firestore?: FirestoreConfig;

  /**
   * Firebase Cloud Functions configuration
   */
  functions?: FunctionsConfig;

  /**
   * Firebase Hosting configuration
   */
  hosting?: HostingConfig;

  storage?: StorageConfig;

  remoteconfig?: RemoteConfigConfig;

  emulators?: EmulatorsConfig;
};
