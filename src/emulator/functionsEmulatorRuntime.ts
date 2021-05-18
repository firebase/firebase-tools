import { EmulatorLog } from "./types";
import { CloudFunction, DeploymentOptions, https } from "firebase-functions";
import {
  EmulatedTrigger,
  EmulatedTriggerDefinition,
  EmulatedTriggerMap,
  EmulatedTriggerType,
  findModuleRoot,
  FunctionsRuntimeBundle,
  FunctionsRuntimeFeatures,
  getEmulatedTriggersFromDefinitions,
  FunctionsRuntimeArgs,
  HttpConstants,
} from "./functionsEmulatorShared";
import { Constants } from "./constants";
import { parseVersionString, compareVersionStrings } from "./functionsEmulatorUtils";
import * as express from "express";
import * as path from "path";
import * as admin from "firebase-admin";
import * as bodyParser from "body-parser";
import * as fs from "fs";
import { URL } from "url";
import * as _ from "lodash";

let triggers: EmulatedTriggerMap | undefined;
let developerPkgJSON: PackageJSON | undefined;

function isFeatureEnabled(
  frb: FunctionsRuntimeBundle,
  feature: keyof FunctionsRuntimeFeatures
): boolean {
  return frb.disabled_features ? !frb.disabled_features[feature] : true;
}

function noOp(): false {
  return false;
}

function requireAsync(moduleName: string, opts?: { paths: string[] }): Promise<any> {
  return new Promise((res, rej) => {
    try {
      res(require(require.resolve(moduleName, opts)));
    } catch (e) {
      rej(e);
    }
  });
}

function requireResolveAsync(moduleName: string, opts?: { paths: string[] }): Promise<string> {
  return new Promise((res, rej) => {
    try {
      res(require.resolve(moduleName, opts));
    } catch (e) {
      rej(e);
    }
  });
}

interface PackageJSON {
  engines?: { node?: string };
  dependencies: { [name: string]: any };
  devDependencies: { [name: string]: any };
}

interface ModuleResolution {
  declared: boolean;
  installed: boolean;
  version?: string;
  resolution?: string;
}

interface SuccessfulModuleResolution {
  declared: true;
  installed: true;
  version: string;
  resolution: string;
}

interface ProxyTarget extends Object {
  [key: string]: any;
}

/*
  This helper is used to create mocks for Firebase SDKs. It simplifies creation of Proxy objects
  by allowing us to easily overide some or all of an objects methods. When placed back into require's
  cache the proxy will be automatically used when the module is imported so we can influence the runtime
  behavior of Firebase SDKs in user code.

  const px = new Proxied({"value": 1});
  px.when("incremented", (original) => original["value"] + 1);

  const obj = px.finalize();
  obj.value == 1;
  obj.incremented == 2;
   */
class Proxied<T extends ProxyTarget> {
  /**
   * Gets a property from the original object.
   */
  static getOriginal(target: any, key: string): any {
    const value = target[key];

    if (!Proxied.isExists(value)) {
      return undefined;
    } else if (Proxied.isConstructor(value) || typeof value !== "function") {
      return value;
    } else {
      return value.bind(target);
    }
  }

  /**
   * Run the original target.
   */
  static applyOriginal(target: any, thisArg: any, argArray: any[]): any {
    return target.apply(thisArg, argArray);
  }

  private static isConstructor(obj: any): boolean {
    return !!obj.prototype && !!obj.prototype.constructor.name;
  }

  private static isExists(obj: any): boolean {
    return obj !== undefined;
  }

  proxy: T;
  private anyValue?: (target: T, key: string) => any;
  private appliedValue?: () => any;
  private rewrites: {
    [key: string]: (target: T, key: string) => any;
  } = {};

  /**
   * When initialized an original object is passed. This object is supplied to both .when()
   * and .any() functions so the original value of the object is accessible. When no
   * .any() is provided, the original value of the object is returned when the field
   * key does not match any known rewrite.
   */
  constructor(private original: T) {
    this.proxy = new Proxy(this.original, {
      get: (target, key) => {
        key = key.toString();
        if (this.rewrites[key]) {
          return this.rewrites[key](target, key);
        }

        if (this.anyValue) {
          return this.anyValue(target, key);
        }

        return Proxied.getOriginal(target, key);
      },
      apply: (target, thisArg, argArray) => {
        if (this.appliedValue) {
          return this.appliedValue.apply(thisArg, argArray);
        } else {
          return Proxied.applyOriginal(target, thisArg, argArray);
        }
      },
    });
  }

  /**
   * Calling .when("a", () => "b") will rewrite obj["a"] to be equal to "b"
   */
  when(key: string, value: (target: T, key: string) => any): Proxied<T> {
    this.rewrites[key] = value;
    return this as Proxied<T>;
  }

  /**
   * Calling .any(() => "b") will rewrite all fields on obj to be equal to "b"
   */
  any(value: (target: T, key: string) => any): Proxied<T> {
    this.anyValue = value;
    return this as Proxied<T>;
  }

  /**
   * Calling .applied(() => "b") will make obj() equal to "b"
   */
  applied(value: () => any): Proxied<T> {
    this.appliedValue = value;
    return this as Proxied<T>;
  }

  /**
   * Return the final proxied object.
   */
  finalize(): T {
    return this.proxy;
  }
}

async function resolveDeveloperNodeModule(
  frb: FunctionsRuntimeBundle,
  name: string
): Promise<ModuleResolution> {
  const pkg = requirePackageJson(frb);
  if (!pkg) {
    new EmulatorLog("SYSTEM", "missing-package-json", "").log();
    throw new Error("Could not find package.json");
  }

  const dependencies = pkg.dependencies;
  const devDependencies = pkg.devDependencies;
  const isInPackageJSON = dependencies[name] || devDependencies[name];

  // If there's no reference to the module in their package.json, prompt them to install it
  if (!isInPackageJSON) {
    return { declared: false, installed: false };
  }

  // Once we know it's in the package.json, make sure it's actually `npm install`ed
  const resolveResult = await requireResolveAsync(name, { paths: [frb.cwd] }).catch(noOp);
  if (!resolveResult) {
    return { declared: true, installed: false };
  }

  const modPackageJSON = require(path.join(findModuleRoot(name, resolveResult), "package.json"));

  const moduleResolution: ModuleResolution = {
    declared: true,
    installed: true,
    version: modPackageJSON.version,
    resolution: resolveResult,
  };

  logDebug(`Resolved module ${name}`, moduleResolution);
  return moduleResolution;
}

async function assertResolveDeveloperNodeModule(
  frb: FunctionsRuntimeBundle,
  name: string
): Promise<SuccessfulModuleResolution> {
  const resolution = await resolveDeveloperNodeModule(frb, name);
  if (
    !(resolution.installed && resolution.declared && resolution.resolution && resolution.version)
  ) {
    throw new Error(
      `Assertion failure: could not fully resolve ${name}: ${JSON.stringify(resolution)}`
    );
  }

  return resolution as SuccessfulModuleResolution;
}

async function verifyDeveloperNodeModules(frb: FunctionsRuntimeBundle): Promise<boolean> {
  const modBundles = [
    { name: "firebase-admin", isDev: false, minVersion: "8.9.0" },
    { name: "firebase-functions", isDev: false, minVersion: "3.3.0" },
  ];

  for (const modBundle of modBundles) {
    const resolution = await resolveDeveloperNodeModule(frb, modBundle.name);

    /*
    If there's no reference to the module in their package.json, prompt them to install it
     */
    if (!resolution.declared) {
      new EmulatorLog("SYSTEM", "missing-module", "", modBundle).log();
      return false;
    }

    if (!resolution.installed) {
      new EmulatorLog("SYSTEM", "uninstalled-module", "", modBundle).log();
      return false;
    }

    if (compareVersionStrings(resolution.version, modBundle.minVersion) < 0) {
      new EmulatorLog("SYSTEM", "out-of-date-module", "", modBundle).log();
      return false;
    }
  }

  return true;
}

/**
 * Get the developer's package.json file.
 */
function requirePackageJson(frb: FunctionsRuntimeBundle): PackageJSON | undefined {
  if (developerPkgJSON) {
    return developerPkgJSON;
  }

  try {
    const pkg = require(`${frb.cwd}/package.json`);
    developerPkgJSON = {
      engines: pkg.engines || {},
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
    };
    return developerPkgJSON;
  } catch (err) {
    return;
  }
}

/**
 * We mock out a ton of different paths that we can take to network I/O. It doesn't matter if they
 * overlap (like TLS and HTTPS) because the dev will either allowlist, block, or allow for one
 * invocation on the first prompt, so we can be aggressive here.
 *
 * Sadly, these vary a lot between Node versions and it will always be possible to route around
 * this, it's not security - just a helper. A good example of something difficult to catch is
 * any I/O done via node-gyp (https://github.com/nodejs/node-gyp) since that I/O will be done in
 * C, we have to catch it before then (which is how the google-gax blocker could work).
 *
 * So yeah, we'll try our best and hopefully we can catch 90% of requests.
 */
function initializeNetworkFiltering(frb: FunctionsRuntimeBundle): void {
  const networkingModules = [
    { name: "http", module: require("http"), path: ["request"] },
    { name: "http", module: require("http"), path: ["get"] },
    { name: "https", module: require("https"), path: ["request"] },
    { name: "https", module: require("https"), path: ["get"] },
    { name: "net", module: require("net"), path: ["connect"] },
    // HTTP2 is not currently mocked due to the inability to quiet Experiment warnings in Node.
  ];

  const history: { [href: string]: boolean } = {};
  const results = networkingModules.map((bundle) => {
    let obj = bundle.module;
    for (const field of bundle.path.slice(0, -1)) {
      obj = obj[field];
    }

    const method = bundle.path.slice(-1)[0];
    const original = obj[method].bind(bundle.module);

    /* tslint:disable:only-arrow-functions */
    // This can't be an arrow function because it needs to be new'able
    obj[method] = function (...args: any[]): any {
      const hrefs = args
        .map((arg) => {
          if (typeof arg === "string") {
            try {
              new URL(arg);
              return arg;
            } catch (err) {
              return;
            }
          } else if (typeof arg === "object") {
            return arg.href;
          } else {
            return;
          }
        })
        .filter((v) => v);
      const href = (hrefs.length && hrefs[0]) || "";

      if (href && !history[href] && !href.startsWith("http://localhost")) {
        history[href] = true;
        if (href.indexOf("googleapis.com") !== -1) {
          new EmulatorLog("SYSTEM", "googleapis-network-access", "", {
            href,
            module: bundle.name,
          }).log();
        } else {
          new EmulatorLog("SYSTEM", "unidentified-network-access", "", {
            href,
            module: bundle.name,
          }).log();
        }
      }

      try {
        return original(...args);
      } catch (e) {
        const newed = new original(...args); // eslint-disable-line new-cap
        return newed;
      }
    };

    return { name: bundle.name, status: "mocked" };
  });

  logDebug("Outgoing network have been stubbed.", results);
}

type CallableHandler = (data: any, context: https.CallableContext) => any | Promise<any>;
type HttpsHandler = (req: Request, resp: Response) => void;

/*
    This stub handles a very specific use-case, when a developer (incorrectly) provides a HTTPS handler
    which returns a promise. In this scenario, we can't catch errors which get raised in user code,
    because they're happening async and then the errors get lost when firebase-functions drops the return value.

    Currently, Node is willing to raise the error as an ugly un-handled promise, but this is hard to
    read and long-term will be silenced by Node. Instead, we stub out onRequest and put a special reference
    directly to the handler so we can invoke it directly and catch the errors in our normal reporting chain.

    The relevant firebase-functions code is:
https://github.com/firebase/firebase-functions/blob/9e3bda13565454543b4c7b2fd10fb627a6a3ab97/src/providers/https.ts#L66
   */
async function initializeFirebaseFunctionsStubs(frb: FunctionsRuntimeBundle): Promise<void> {
  const firebaseFunctionsResolution = await assertResolveDeveloperNodeModule(
    frb,
    "firebase-functions"
  );
  const firebaseFunctionsRoot = findModuleRoot(
    "firebase-functions",
    firebaseFunctionsResolution.resolution
  );
  const httpsProviderResolution = path.join(firebaseFunctionsRoot, "lib/providers/https");
  const httpsProvider = require(httpsProviderResolution);

  // TODO: Remove this logic and stop relying on internal APIs.  See #1480 for reasoning.
  const onRequestInnerMethodName = "_onRequestWithOptions";
  const onRequestMethodOriginal = httpsProvider[onRequestInnerMethodName];

  httpsProvider[onRequestInnerMethodName] = (handler: HttpsHandler, opts: DeploymentOptions) => {
    const cf = onRequestMethodOriginal(handler, opts);
    cf.__emulator_func = handler;
    return cf;
  };

  // If you take a look at the link above, you'll see that onRequest relies on _onRequestWithOptions
  // so in theory, we should only need to mock _onRequestWithOptions, however that is not the case
  // because onRequest is defined in the same scope as _onRequestWithOptions, so replacing
  // the definition of _onRequestWithOptions does not replace the link to the original function
  // which onRequest uses, so we need to manually force it to use our version.
  httpsProvider.onRequest = (handler: HttpsHandler) => {
    return httpsProvider[onRequestInnerMethodName](handler, {});
  };

  // Mocking https.onCall is very similar to onRequest
  const onCallInnerMethodName = "_onCallWithOptions";
  const onCallMethodOriginal = httpsProvider[onCallInnerMethodName];

  httpsProvider[onCallInnerMethodName] = (handler: CallableHandler, opts: DeploymentOptions) => {
    const wrapped = wrapCallableHandler(handler);
    const cf = onCallMethodOriginal(wrapped, opts);
    return cf;
  };

  httpsProvider.onCall = (handler: CallableHandler) => {
    return httpsProvider[onCallInnerMethodName](handler, {});
  };
}

/**
 * Wrap a callable functions handler with an outer method that extracts a special authorization
 * header used to mock auth in the emulator.
 */
function wrapCallableHandler(handler: CallableHandler): CallableHandler {
  const newHandler = (data: any, context: https.CallableContext) => {
    if (context.rawRequest) {
      const authContext = context.rawRequest.header(HttpConstants.CALLABLE_AUTH_HEADER);
      if (authContext) {
        logDebug("Callable functions auth override", {
          key: HttpConstants.CALLABLE_AUTH_HEADER,
          value: authContext,
        });
        context.auth = JSON.parse(decodeURIComponent(authContext));
        delete context.rawRequest.headers[HttpConstants.CALLABLE_AUTH_HEADER];
      } else {
        logDebug("No callable functions auth found");
      }

      // Restore the original auth header in case the code relies on parsing it (for
      // example, the code could forward it to another function or server).
      const originalAuth = context.rawRequest.header(HttpConstants.ORIGINAL_AUTH_HEADER);
      if (originalAuth) {
        context.rawRequest.headers["authorization"] = originalAuth;
        delete context.rawRequest.headers[HttpConstants.ORIGINAL_AUTH_HEADER];
      }
    }
    return handler(data, context);
  };

  return newHandler;
}

function getDefaultConfig(): any {
  return JSON.parse(process.env.FIREBASE_CONFIG || "{}");
}

/**
 * This stub is the most important and one of the only non-optional stubs.This feature redirects
 * writes from the admin SDK back into emulated resources.
 *
 * To do this, we replace initializeApp so it drops the developers config options and returns a restricted,
 * unauthenticated app.
 *
 * We also mock out firestore.settings() so we can merge the emulator settings with the developer's.
 */
async function initializeFirebaseAdminStubs(frb: FunctionsRuntimeBundle): Promise<void> {
  const adminResolution = await assertResolveDeveloperNodeModule(frb, "firebase-admin");
  const localAdminModule = require(adminResolution.resolution);

  const functionsResolution = await assertResolveDeveloperNodeModule(frb, "firebase-functions");
  const localFunctionsModule = require(functionsResolution.resolution);

  // Configuration from the environment
  const defaultConfig = getDefaultConfig();

  const adminModuleProxy = new Proxied<typeof admin>(localAdminModule);
  const proxiedAdminModule = adminModuleProxy
    .when("initializeApp", (adminModuleTarget) => (opts?: admin.AppOptions, appName?: string) => {
      if (appName) {
        new EmulatorLog("SYSTEM", "non-default-admin-app-used", "", { appName, opts }).log();
        return adminModuleTarget.initializeApp(opts, appName);
      }

      // If initializeApp() is called with options we use the provided options, otherwise
      // we use the default options.
      const defaultAppOptions = opts ? opts : defaultConfig;
      new EmulatorLog("SYSTEM", "default-admin-app-used", `config=${defaultAppOptions}`, {
        opts: defaultAppOptions,
      }).log();

      const defaultApp: admin.app.App = makeProxiedFirebaseApp(
        frb,
        adminModuleTarget.initializeApp(defaultAppOptions)
      );
      logDebug("initializeApp(DEFAULT)", defaultAppOptions);

      // Tell the Firebase Functions SDK to use the proxied app so that things like "change.after.ref"
      // point to the right place.
      localFunctionsModule.app.setEmulatedAdminApp(defaultApp);

      // When the auth emulator is running, try to disable JWT verification.
      if (frb.emulators.auth) {
        if (compareVersionStrings(adminResolution.version, "9.3.0") < 0) {
          new EmulatorLog(
            "WARN_ONCE",
            "runtime-status",
            "The Firebase Authentication emulator is running, but your 'firebase-admin' dependency is below version 9.3.0, so calls to Firebase Authentication will affect production."
          ).log();
        } else if (compareVersionStrings(adminResolution.version, "9.4.2") <= 0) {
          // Between firebase-admin versions 9.3.0 and 9.4.2 (inclusive) we used the
          // "auth.setJwtVerificationEnabled" hack to disable JWT verification while emulating.
          // See: https://github.com/firebase/firebase-admin-node/pull/1148
          const auth = defaultApp.auth();
          if (typeof (auth as any).setJwtVerificationEnabled === "function") {
            logDebug("auth.setJwtVerificationEnabled(false)", {});
            (auth as any).setJwtVerificationEnabled(false);
          } else {
            logDebug("auth.setJwtVerificationEnabled not available", {});
          }
        }
      }

      return defaultApp;
    })
    .when("firestore", (target) => {
      warnAboutFirestoreProd(frb);
      return Proxied.getOriginal(target, "firestore");
    })
    .when("database", (target) => {
      warnAboutDatabaseProd(frb);
      return Proxied.getOriginal(target, "database");
    })
    .when("auth", (target) => {
      warnAboutAuthProd(frb);
      return Proxied.getOriginal(target, "auth");
    })
    .finalize();

  // Stub the admin module in the require cache
  require.cache[adminResolution.resolution] = {
    exports: proxiedAdminModule,
  };

  logDebug("firebase-admin has been stubbed.", {
    adminResolution,
  });
}

function makeProxiedFirebaseApp(
  frb: FunctionsRuntimeBundle,
  original: admin.app.App
): admin.app.App {
  const appProxy = new Proxied<admin.app.App>(original);
  return appProxy
    .when("firestore", (target: any) => {
      warnAboutFirestoreProd(frb);
      return Proxied.getOriginal(target, "firestore");
    })
    .when("database", (target: any) => {
      warnAboutDatabaseProd(frb);
      return Proxied.getOriginal(target, "database");
    })
    .when("auth", (target: any) => {
      warnAboutAuthProd(frb);
      return Proxied.getOriginal(target, "auth");
    })
    .finalize();
}

function warnAboutFirestoreProd(frb: FunctionsRuntimeBundle): void {
  if (frb.emulators.firestore) {
    return;
  }

  new EmulatorLog(
    "WARN_ONCE",
    "runtime-status",
    "The Cloud Firestore emulator is not running, so calls to Firestore will affect production."
  ).log();
}

function warnAboutDatabaseProd(frb: FunctionsRuntimeBundle): void {
  if (frb.emulators.database) {
    return;
  }

  new EmulatorLog(
    "WARN_ONCE",
    "runtime-status",
    "The Realtime Database emulator is not running, so calls to Realtime Database will affect production."
  ).log();
}

function warnAboutAuthProd(frb: FunctionsRuntimeBundle): void {
  if (frb.emulators.auth) {
    return;
  }

  new EmulatorLog(
    "WARN_ONCE",
    "runtime-status",
    "The Firebase Authentication emulator is not running, so calls to Firebase Authentication will affect production."
  ).log();
}

async function initializeEnvironmentalVariables(frb: FunctionsRuntimeBundle): Promise<void> {
  process.env.TZ = "UTC";
  process.env.GCLOUD_PROJECT = frb.projectId;
  process.env.FUNCTIONS_EMULATOR = "true";

  // Look for .runtimeconfig.json in the functions directory
  const configPath = `${frb.cwd}/.runtimeconfig.json`;
  try {
    const configContent = fs.readFileSync(configPath, "utf8");
    if (configContent) {
      // try JSON.parse for .runtimeconfig.json and notice if parsing is failed
      try {
        JSON.parse(configContent.toString());

        logDebug(`Found local functions config: ${configPath}`);
        process.env.CLOUD_RUNTIME_CONFIG = configContent.toString();
      } catch (e) {
        new EmulatorLog("SYSTEM", "function-runtimeconfig-json-invalid", "").log();
      }
    }
  } catch (e) {
    // Ignore, config is optional
  }

  // Before firebase-functions version 3.8.0 the Functions SDK would reject non-prod database URLs.
  const functionsResolution = await assertResolveDeveloperNodeModule(frb, "firebase-functions");
  const functionsGt380 = compareVersionStrings(functionsResolution.version, "3.8.0") >= 0;
  let emulatedDatabaseURL = undefined;
  if (frb.emulators.database && functionsGt380) {
    // Database URL will look like one of:
    //  - https://${namespace}.firebaseio.com
    //  - https://${namespace}.${location}.firebasedatabase.app
    let ns = frb.projectId;
    if (frb.adminSdkConfig.databaseURL) {
      const asUrl = new URL(frb.adminSdkConfig.databaseURL);
      ns = asUrl.hostname.split(".")[0];
    }

    emulatedDatabaseURL = `http://${formatHost(frb.emulators.database)}/?ns=${ns}`;
  }

  process.env.FIREBASE_CONFIG = JSON.stringify({
    storageBucket: frb.adminSdkConfig.storageBucket,
    databaseURL: emulatedDatabaseURL || frb.adminSdkConfig.databaseURL,
    projectId: frb.projectId,
  });

  if (frb.triggerId) {
    // Runtime values are based on information from the bundle. Proper information for this is
    // available once the target code has been loaded, which is too late.
    const service = frb.triggerId || "";
    const target = service.replace(/-/g, ".");
    const mode = frb.triggerType === EmulatedTriggerType.BACKGROUND ? "event" : "http";

    let nodeVersion = 0;
    if (frb.nodeMajorVersion) {
      // If nodeMajorVersion is set, we ignore pkg.engines.node
      nodeVersion = frb.nodeMajorVersion;
    } else {
      const pkg = requirePackageJson(frb);
      if (pkg?.engines?.node) {
        const nodeSemVer = parseVersionString(pkg.engines.node);
        nodeVersion = nodeSemVer.major;
      }
    }

    // Setup predefined environment variables for Node.js 10 and subsequent runtimes
    // https://cloud.google.com/functions/docs/env-var
    if (nodeVersion >= 10) {
      setNode10EnvVars(target, mode, service);
    }
  }

  // Make firebase-admin point at the Firestore emulator
  if (frb.emulators.firestore) {
    process.env[Constants.FIRESTORE_EMULATOR_HOST] = formatHost(frb.emulators.firestore);
  }

  // Make firebase-admin point at the Database emulator
  if (frb.emulators.database) {
    process.env[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = formatHost(frb.emulators.database);
  }

  // Make firebase-admin point at the Auth emulator
  if (frb.emulators.auth) {
    process.env[Constants.FIREBASE_AUTH_EMULATOR_HOST] = formatHost(frb.emulators.auth);
  }

  // Make firebase-admin point at the Storage emulator
  if (frb.emulators.storage) {
    process.env[Constants.FIREBASE_STORAGE_EMULATOR_HOST] = formatHost(frb.emulators.storage);
    process.env[Constants.CLOUD_STORAGE_EMULATOR_HOST] = `http://${formatHost(
      frb.emulators.storage
    )}`;
  }

  if (frb.emulators.pubsub) {
    const pubsubHost = formatHost(frb.emulators.pubsub);
    process.env.PUBSUB_EMULATOR_HOST = pubsubHost;
    logDebug(`Set PUBSUB_EMULATOR_HOST to ${pubsubHost}`);
  }
}

// This is a duplicate of the helper we use elsewhere but it's important not to
// add dependencies to this runtime.
function formatHost(info: { host: string; port: number }) {
  if (info.host.includes(":")) {
    return `[${info.host}]:${info.port}`;
  } else {
    return `${info.host}:${info.port}`;
  }
}

async function initializeFunctionsConfigHelper(frb: FunctionsRuntimeBundle): Promise<void> {
  const functionsResolution = await assertResolveDeveloperNodeModule(frb, "firebase-functions");
  const localFunctionsModule = require(functionsResolution.resolution);

  logDebug("Checked functions.config()", {
    config: localFunctionsModule.config(),
  });

  const originalConfig = localFunctionsModule.config();
  const proxiedConfig = new Proxied(originalConfig)
    .any((parentConfig, parentKey) => {
      const isInternal = parentKey.startsWith("Symbol(") || parentKey.startsWith("inspect");
      if (!parentConfig[parentKey] && !isInternal) {
        new EmulatorLog("SYSTEM", "functions-config-missing-value", "", {
          key: parentKey,
        }).log();
      }

      return parentConfig[parentKey];
    })
    .finalize();

  const functionsModuleProxy = new Proxied<typeof localFunctionsModule>(localFunctionsModule);
  const proxiedFunctionsModule = functionsModuleProxy
    .when("config", (target) => () => {
      return proxiedConfig;
    })
    .finalize();

  // Stub the functions module in the require cache
  require.cache[functionsResolution.resolution] = {
    exports: proxiedFunctionsModule,
  };

  logDebug("firebase-functions has been stubbed.", {
    functionsResolution,
  });
}

/**
 * Setup predefined environment variables for Node.js 10 and subsequent runtimes
 * https://cloud.google.com/functions/docs/env-var
 */
function setNode10EnvVars(target: string, mode: "event" | "http", service: string) {
  process.env.FUNCTION_TARGET = target;
  process.env.FUNCTION_SIGNATURE_TYPE = mode;
  process.env.K_SERVICE = service;
  process.env.K_REVISION = "1";
  process.env.PORT = "80";
}

/*
 Retains a reference to the raw body buffer to allow access to the raw body for things like request
 signature validation. This is used as the "verify" function in body-parser options.
*/
function rawBodySaver(req: express.Request, res: express.Response, buf: Buffer): void {
  (req as any).rawBody = buf;
}

async function processHTTPS(frb: FunctionsRuntimeBundle, trigger: EmulatedTrigger): Promise<void> {
  const ephemeralServer = express();
  const functionRouter = express.Router(); // eslint-disable-line new-cap
  const socketPath = frb.socketPath;

  if (!socketPath) {
    new EmulatorLog("FATAL", "runtime-error", "Called processHTTPS with no socketPath").log();
    return;
  }

  await new Promise((resolveEphemeralServer, rejectEphemeralServer) => {
    const handler = async (req: express.Request, res: express.Response) => {
      try {
        logDebug(`Ephemeral server handling ${req.method} request`);
        const func = trigger.getRawFunction();
        res.on("finish", () => {
          instance.close((err) => {
            if (err) {
              rejectEphemeralServer(err);
            } else {
              resolveEphemeralServer();
            }
          });
        });

        await runHTTPS([req, res], func);
      } catch (err) {
        rejectEphemeralServer(err);
      }
    };

    ephemeralServer.enable("trust proxy");
    ephemeralServer.use(
      bodyParser.json({
        limit: "10mb",
        verify: rawBodySaver,
      })
    );
    ephemeralServer.use(
      bodyParser.text({
        limit: "10mb",
        verify: rawBodySaver,
      })
    );
    ephemeralServer.use(
      bodyParser.urlencoded({
        extended: true,
        limit: "10mb",
        verify: rawBodySaver,
      })
    );
    ephemeralServer.use(
      bodyParser.raw({
        type: "*/*",
        limit: "10mb",
        verify: rawBodySaver,
      })
    );

    functionRouter.all("*", handler);

    ephemeralServer.use([`/`, `/*`], functionRouter);

    logDebug(`Attempting to listen to socketPath: ${socketPath}`);
    const instance = ephemeralServer.listen(socketPath, () => {
      new EmulatorLog("SYSTEM", "runtime-status", "ready", { state: "ready" }).log();
    });

    instance.on("error", rejectEphemeralServer);
  });
}

async function processBackground(
  frb: FunctionsRuntimeBundle,
  trigger: EmulatedTrigger
): Promise<void> {
  const proto = frb.proto;
  logDebug("ProcessBackground", proto);

  // All formats of the payload should carry a "data" property. The "context" property does
  // not exist in all versions. Where it doesn't exist, context is everything besides data.
  const data = proto.data;
  delete proto.data;
  const context = proto.context ? proto.context : proto;

  // This is due to the fact that the Firestore emulator sends payloads in a newer
  // format than production firestore.
  if (!proto.eventType || !proto.eventType.startsWith("google.storage")) {
    if (context.resource && context.resource.name) {
      logDebug("ProcessBackground: lifting resource.name from resource", context.resource);
      context.resource = context.resource.name;
    }
  }

  await runBackground({ data, context }, trigger.getRawFunction());
}

/**
 * Run the given function while redirecting logs and looking out for errors.
 */
async function runFunction(func: () => Promise<any>): Promise<any> {
  let caughtErr;
  try {
    await func();
  } catch (err) {
    caughtErr = err;
  }

  logDebug(`Ephemeral server survived.`);
  if (caughtErr) {
    throw caughtErr;
  }
}

async function runBackground(proto: any, func: CloudFunction<any>): Promise<any> {
  logDebug("RunBackground", proto);

  await runFunction(() => {
    return func(proto.data, proto.context);
  });
}

async function runHTTPS(
  args: any[],
  func: (a: express.Request, b: express.Response) => Promise<any>
): Promise<any> {
  if (args.length < 2) {
    throw new Error("Function must be passed 2 args.");
  }

  await runFunction(() => {
    return func(args[0], args[1]);
  });
}

/*
  This method attempts to help a developer whose code can't be loaded by suggesting
  possible fixes based on the files in their functions directory.
 */
async function moduleResolutionDetective(frb: FunctionsRuntimeBundle, error: Error): Promise<void> {
  /*
  These files could all potentially exist, if they don't then the value in the map will be
  falsey, so we just catch to keep from throwing.
   */
  const clues = {
    tsconfigJSON: await requireAsync("./tsconfig.json", { paths: [frb.cwd] }).catch(noOp),
    packageJSON: await requireAsync("./package.json", { paths: [frb.cwd] }).catch(noOp),
  };

  const isPotentially = {
    typescript: false,
    uncompiled: false,
    wrong_directory: false,
  };

  isPotentially.typescript = !!clues.tsconfigJSON;
  isPotentially.wrong_directory = !clues.packageJSON;
  isPotentially.uncompiled = !!_.get(clues.packageJSON, "scripts.build", false);

  new EmulatorLog("SYSTEM", "function-code-resolution-failed", "", {
    isPotentially,
    error: error.stack,
  }).log();
}

function logDebug(msg: string, data?: any): void {
  new EmulatorLog("DEBUG", "runtime-status", `[${process.pid}] ${msg}`, data).log();
}

async function invokeTrigger(
  frb: FunctionsRuntimeBundle,
  triggers: EmulatedTriggerMap
): Promise<void> {
  if (!frb.triggerId) {
    throw new Error("frb.triggerId unexpectedly null");
  }

  new EmulatorLog("INFO", "runtime-status", `Beginning execution of "${frb.triggerId}"`, {
    frb,
  }).log();

  const trigger = triggers[frb.triggerId];
  logDebug("triggerDefinition", trigger.definition);
  const mode = trigger.definition.httpsTrigger ? "HTTPS" : "BACKGROUND";

  logDebug(`Running ${frb.triggerId} in mode ${mode}`);

  let seconds = 0;
  const timerId = setInterval(() => {
    seconds++;
  }, 1000);

  let timeoutId;
  if (isFeatureEnabled(frb, "timeout")) {
    timeoutId = setTimeout(() => {
      new EmulatorLog(
        "WARN",
        "runtime-status",
        `Your function timed out after ~${
          trigger.definition.timeout || "60s"
        }. To configure this timeout, see
      https://firebase.google.com/docs/functions/manage-functions#set_timeout_and_memory_allocation.`
      ).log();
      throw new Error("Function timed out.");
    }, trigger.timeoutMs);
  }

  switch (mode) {
    case "BACKGROUND":
      await processBackground(frb, triggers[frb.triggerId]);
      break;
    case "HTTPS":
      await processHTTPS(frb, triggers[frb.triggerId]);
      break;
  }

  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  clearInterval(timerId);

  new EmulatorLog(
    "INFO",
    "runtime-status",
    `Finished "${frb.triggerId}" in ~${Math.max(seconds, 1)}s`
  ).log();
}

async function initializeRuntime(
  frb: FunctionsRuntimeBundle,
  serializedFunctionTrigger?: string,
  extensionTriggers?: EmulatedTriggerDefinition[]
): Promise<EmulatedTriggerMap | undefined> {
  logDebug(`Disabled runtime features: ${JSON.stringify(frb.disabled_features)}`);

  const verified = await verifyDeveloperNodeModules(frb);
  if (!verified) {
    // If we can't verify the node modules, then just leave, something bad will happen during runtime.
    new EmulatorLog(
      "INFO",
      "runtime-status",
      `Your functions could not be parsed due to an issue with your node_modules (see above)`
    ).log();
    return;
  }

  await initializeEnvironmentalVariables(frb);
  initializeNetworkFiltering(frb);
  await initializeFunctionsConfigHelper(frb);
  await initializeFirebaseFunctionsStubs(frb);
  await initializeFirebaseAdminStubs(frb);

  let triggerDefinitions: EmulatedTriggerDefinition[] = [];
  let triggerModule;

  if (serializedFunctionTrigger) {
    /* tslint:disable:no-eval */
    triggerModule = eval(serializedFunctionTrigger)();
  } else {
    try {
      triggerModule = require(frb.cwd);
    } catch (err) {
      await moduleResolutionDetective(frb, err);
      return;
    }
  }
  if (extensionTriggers) {
    triggerDefinitions = extensionTriggers;
  } else {
    require("../deploy/functions/discovery/jsexports/extractTriggers")(
      triggerModule,
      triggerDefinitions
    );
  }

  const triggers = getEmulatedTriggersFromDefinitions(triggerDefinitions, triggerModule);

  new EmulatorLog("SYSTEM", "triggers-parsed", "", { triggers, triggerDefinitions }).log();
  return triggers;
}

async function flushAndExit(code: number) {
  await EmulatorLog.waitForFlush();
  process.exit(code);
}

async function goIdle() {
  new EmulatorLog("SYSTEM", "runtime-status", "Runtime is now idle", { state: "idle" }).log();
  await EmulatorLog.waitForFlush();
}

async function handleMessage(message: string) {
  let runtimeArgs: FunctionsRuntimeArgs;
  try {
    runtimeArgs = JSON.parse(message) as FunctionsRuntimeArgs;
  } catch (e) {
    new EmulatorLog("FATAL", "runtime-error", `Got unexpected message body: ${message}`).log();
    await flushAndExit(1);
    return;
  }

  if (!triggers) {
    const serializedTriggers = runtimeArgs.opts ? runtimeArgs.opts.serializedTriggers : undefined;
    const extensionTriggers = runtimeArgs.opts ? runtimeArgs.opts.extensionTriggers : undefined;
    triggers = await initializeRuntime(runtimeArgs.frb, serializedTriggers, extensionTriggers);
  }

  // If we don't have triggers by now, we can't run.
  if (!triggers) {
    await flushAndExit(1);
    return;
  }

  // If there's no trigger id it's just a diagnostic call. We can go idle right away.
  if (!runtimeArgs.frb.triggerId) {
    await goIdle();
    return;
  }

  if (!triggers[runtimeArgs.frb.triggerId]) {
    new EmulatorLog(
      "FATAL",
      "runtime-status",
      `Could not find trigger "${runtimeArgs.frb.triggerId}" in your functions directory.`
    ).log();
    return;
  } else {
    logDebug(`Trigger "${runtimeArgs.frb.triggerId}" has been found, beginning invocation!`);
  }

  try {
    await invokeTrigger(runtimeArgs.frb, triggers);

    // If we were passed serialized triggers we have to exit the runtime after,
    // otherwise we can go IDLE and await another request.
    if (runtimeArgs.opts && runtimeArgs.opts.serializedTriggers) {
      await flushAndExit(0);
    } else {
      await goIdle();
    }
  } catch (err) {
    new EmulatorLog("FATAL", "runtime-error", err.stack ? err.stack : err).log();
    await flushAndExit(1);
  }
}

function main(): void {
  // Since the functions run as attached processes they naturally inherit SIGINT
  // sent to the functions emulator. We want them to ignore the first signal
  // to allow for a clean shutdown.
  let lastSignal = new Date().getTime();
  let signalCount = 0;
  process.on("SIGINT", () => {
    const now = new Date().getTime();
    if (now - lastSignal < 100) {
      return;
    }

    signalCount = signalCount + 1;
    lastSignal = now;

    if (signalCount >= 2) {
      process.exit(1);
    }
  });

  logDebug("Functions runtime initialized.", {
    cwd: process.cwd(),
    node_version: process.versions.node,
  });

  // Event emitters do not work well with async functions, so we
  // construct our own promise chain to make sure each message is
  // handled only after the previous message handling is complete.
  let messageHandlePromise = Promise.resolve();
  process.on("message", (message: string) => {
    messageHandlePromise = messageHandlePromise
      .then(() => {
        return handleMessage(message);
      })
      .catch((err) => {
        // All errors *should* be handled within handleMessage. But just in case,
        // we want to exit fatally on any error related to message handling.
        logDebug(`Error in handleMessage: ${message} => ${err}: ${err.stack}`);
        new EmulatorLog("FATAL", "runtime-error", err.message || err, err).log();
        return flushAndExit(1);
      });
  });
}

if (require.main === module) {
  main();
}
