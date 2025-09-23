import * as fs from "fs";

import { CloudFunction, DeploymentOptions, https } from "firebase-functions";
import * as express from "express";
import * as path from "path";
import * as admin from "firebase-admin";
import * as bodyParser from "body-parser";
import { pathToFileURL, URL } from "url";
import * as _ from "lodash";

import { EmulatorLog } from "./types";
import { Constants } from "./constants";
import {
  findModuleRoot,
  FunctionsRuntimeBundle,
  HttpConstants,
  SignatureType,
} from "./functionsEmulatorShared";
import { compareVersionStrings, isLocalHost } from "./functionsEmulatorUtils";
import { EventUtils } from "./events/types";

interface RequestWithRawBody extends express.Request {
  rawBody: Buffer;
}

let functionModule: any;
let FUNCTION_TARGET_NAME: string;
let FUNCTION_SIGNATURE: string;
let FUNCTION_DEBUG_MODE: string;

let developerPkgJSON: PackageJSON | undefined;

/**
 * Dynamically load import function to prevent TypeScript from
 * transpiling into a require.
 *
 * See https://github.com/microsoft/TypeScript/issues/43329.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("modulePath", "return import(modulePath)");

function noOp(): false {
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireAsync(moduleName: string, opts?: { paths: string[] }): Promise<any> {
  return new Promise((res, rej) => {
    try {
      res(require(require.resolve(moduleName, opts))); // eslint-disable-line @typescript-eslint/no-var-requires
    } catch (e: any) {
      rej(e);
    }
  });
}

function requireResolveAsync(moduleName: string, opts?: { paths: string[] }): Promise<string> {
  return new Promise((res, rej) => {
    try {
      res(require.resolve(moduleName, opts));
    } catch (e: any) {
      rej(e);
    }
  });
}

interface PackageJSON {
  engines?: { node?: string };
  dependencies: { [name: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  devDependencies: { [name: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
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
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/*
  This helper is used to create mocks for Firebase SDKs. It simplifies creation of Proxy objects
  by allowing us to easily overide some or all of an objects methods. When placed back into require's
  cache the proxy will be automatically used when the module is imported so we can influence the runtime
  behavior of Firebase SDKs in user code.

  const px = new Proxied({"value": 1});
  px.when("incremented", (original) => original["value"] + 1);

  const obj = px.finalize();
  obj.value === 1;
  obj.incremented === 2;
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
  private appliedValue?: (...args: any[]) => any;
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
          return this.appliedValue.apply(thisArg);
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

async function resolveDeveloperNodeModule(name: string): Promise<ModuleResolution> {
  const pkg = requirePackageJson();
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
  const resolveResult = await requireResolveAsync(name, { paths: [process.cwd()] }).catch(noOp);
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

async function assertResolveDeveloperNodeModule(name: string): Promise<SuccessfulModuleResolution> {
  const resolution = await resolveDeveloperNodeModule(name);
  if (
    !(resolution.installed && resolution.declared && resolution.resolution && resolution.version)
  ) {
    throw new Error(
      `Assertion failure: could not fully resolve ${name}: ${JSON.stringify(resolution)}`,
    );
  }

  return resolution as SuccessfulModuleResolution;
}

async function verifyDeveloperNodeModules(): Promise<boolean> {
  const modBundles = [
    { name: "firebase-admin", isDev: false, minVersion: "8.9.0" },
    { name: "firebase-functions", isDev: false, minVersion: "3.13.1" },
  ];

  for (const modBundle of modBundles) {
    const resolution = await resolveDeveloperNodeModule(modBundle.name);

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
function requirePackageJson(): PackageJSON | undefined {
  if (developerPkgJSON) {
    return developerPkgJSON;
  }

  try {
    const pkg = require(`${process.cwd()}/package.json`);
    developerPkgJSON = {
      engines: pkg.engines || {},
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
    };
    return developerPkgJSON;
  } catch (err: any) {
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
function initializeNetworkFiltering(): void {
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
            } catch (err: any) {
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

      if (href && !history[href] && !isLocalHost(href)) {
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
      } catch (e: any) {
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
async function initializeFirebaseFunctionsStubs(): Promise<void> {
  const firebaseFunctionsResolution = await assertResolveDeveloperNodeModule("firebase-functions");
  const firebaseFunctionsRoot = findModuleRoot(
    "firebase-functions",
    firebaseFunctionsResolution.resolution,
  );
  const httpsProviderResolution = path.join(firebaseFunctionsRoot, "lib/providers/https");
  const httpsProviderV1Resolution = path.join(firebaseFunctionsRoot, "lib/v1/providers/https");
  let httpsProvider: any;
  try {
    httpsProvider = require(httpsProviderV1Resolution);
  } catch (e: any) {
    httpsProvider = require(httpsProviderResolution);
  }

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

  // Newer versions of the firebase-functions package's _onCallWithOptions method expects 3 arguments.
  if (onCallMethodOriginal.length === 3) {
    httpsProvider[onCallInnerMethodName] = (
      opts: any,
      handler: any,
      deployOpts: DeploymentOptions,
    ) => {
      const wrapped = wrapCallableHandler(handler);
      const cf = onCallMethodOriginal(opts, wrapped, deployOpts);
      return cf;
    };
  } else {
    httpsProvider[onCallInnerMethodName] = (handler: any, opts: DeploymentOptions) => {
      const wrapped = wrapCallableHandler(handler);
      const cf = onCallMethodOriginal(wrapped, opts);
      return cf;
    };
  }

  // Newer versions of the firebase-functions package's onCall method can accept upto 2 arguments.
  httpsProvider.onCall = function (optsOrHandler: any, handler: CallableHandler) {
    if (onCallMethodOriginal.length === 3) {
      let opts;
      if (arguments.length === 1) {
        opts = {};
        handler = optsOrHandler as CallableHandler;
      } else {
        opts = optsOrHandler;
      }
      return httpsProvider[onCallInnerMethodName](opts, handler, {});
    } else {
      return httpsProvider[onCallInnerMethodName](optsOrHandler, {});
    }
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

function initializeRuntimeConfig() {
  // Most recent version of Firebase Functions SDK automatically picks up locally
  // stored .runtimeconfig.json to populate the config entries.
  // However, due to a bug in some older version of the Function SDK, this process may fail.
  //
  // See the following issues for more detail:
  //   https://github.com/firebase/firebase-tools/issues/3793
  //   https://github.com/firebase/firebase-functions/issues/877
  //
  // As a workaround, the emulator runtime will load the contents of the .runtimeconfig.json
  // to the CLOUD_RUNTIME_CONFIG environment variable IF the env var is unused.
  // In the future, we will bump up the minimum version of the Firebase Functions SDK
  // required to run the functions emulator to v3.15.1 and get rid of this workaround.
  if (!process.env.CLOUD_RUNTIME_CONFIG) {
    const configPath = `${process.cwd()}/.runtimeconfig.json`;
    try {
      const configContent = fs.readFileSync(configPath, "utf8");
      if (configContent) {
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
  }
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
async function initializeFirebaseAdminStubs(): Promise<void> {
  const adminResolution = await assertResolveDeveloperNodeModule("firebase-admin");
  const localAdminModule = require(adminResolution.resolution);

  const functionsResolution = await assertResolveDeveloperNodeModule("firebase-functions");
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
        adminModuleTarget.initializeApp(defaultAppOptions),
      );
      logDebug("initializeApp(DEFAULT)", defaultAppOptions);

      // Tell the Firebase Functions SDK to use the proxied app so that things like "change.after.ref"
      // point to the right place.
      localFunctionsModule.app.setEmulatedAdminApp(defaultApp);

      // When the auth emulator is running, try to disable JWT verification.
      if (process.env[Constants.FIREBASE_AUTH_EMULATOR_HOST]) {
        if (compareVersionStrings(adminResolution.version, "9.3.0") < 0) {
          new EmulatorLog(
            "WARN_ONCE",
            "runtime-status",
            "The Firebase Authentication emulator is running, but your 'firebase-admin' dependency is below version 9.3.0, so calls to Firebase Authentication will affect production.",
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
      warnAboutFirestoreProd();
      return Proxied.getOriginal(target, "firestore");
    })
    .when("database", (target) => {
      warnAboutDatabaseProd();
      return Proxied.getOriginal(target, "database");
    })
    .when("auth", (target) => {
      warnAboutAuthProd();
      return Proxied.getOriginal(target, "auth");
    })
    .when("storage", (target) => {
      warnAboutStorageProd();
      return Proxied.getOriginal(target, "storage");
    })
    .finalize();

  // Stub the admin module in the require cache
  const v = require.cache[adminResolution.resolution];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- this is not precedent.
  require.cache[adminResolution.resolution] = Object.assign(v!, {
    exports: proxiedAdminModule,
    path: path.dirname(adminResolution.resolution),
  });

  logDebug("firebase-admin has been stubbed.", {
    adminResolution,
  });
}

function makeProxiedFirebaseApp(original: admin.app.App): admin.app.App {
  const appProxy = new Proxied<admin.app.App>(original);
  return appProxy
    .when("firestore", (target: any) => {
      warnAboutFirestoreProd();
      return Proxied.getOriginal(target, "firestore");
    })
    .when("database", (target: any) => {
      warnAboutDatabaseProd();
      return Proxied.getOriginal(target, "database");
    })
    .when("auth", (target: any) => {
      warnAboutAuthProd();
      return Proxied.getOriginal(target, "auth");
    })
    .when("storage", (target: any) => {
      warnAboutStorageProd();
      return Proxied.getOriginal(target, "storage");
    })
    .finalize();
}

function warnAboutFirestoreProd(): void {
  if (process.env[Constants.FIRESTORE_EMULATOR_HOST]) {
    return;
  }

  new EmulatorLog(
    "WARN_ONCE",
    "runtime-status",
    "The Cloud Firestore emulator is not running, so calls to Firestore will affect production.",
  ).log();
}

function warnAboutDatabaseProd(): void {
  if (process.env[Constants.FIREBASE_DATABASE_EMULATOR_HOST]) {
    return;
  }

  new EmulatorLog(
    "WARN_ONCE",
    "runtime-status",
    "The Realtime Database emulator is not running, so calls to Realtime Database will affect production.",
  ).log();
}

function warnAboutAuthProd(): void {
  if (process.env[Constants.FIREBASE_AUTH_EMULATOR_HOST]) {
    return;
  }

  new EmulatorLog(
    "WARN_ONCE",
    "runtime-status",
    "The Firebase Authentication emulator is not running, so calls to Firebase Authentication will affect production.",
  ).log();
}

function warnAboutStorageProd(): void {
  if (process.env[Constants.FIREBASE_STORAGE_EMULATOR_HOST]) {
    return;
  }

  new EmulatorLog(
    "WARN_ONCE",
    "runtime-status",
    "The Firebase Storage emulator is not running, so calls to Firebase Storage will affect production.",
  ).log();
}

async function initializeFunctionsConfigHelper(): Promise<void> {
  const functionsResolution = await assertResolveDeveloperNodeModule("firebase-functions");
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
    .when("config", () => () => {
      return proxiedConfig;
    })
    .finalize();

  // Stub the functions module in the require cache
  const v = require.cache[functionsResolution.resolution];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- this is not precedent.
  require.cache[functionsResolution.resolution] = Object.assign(v!, {
    exports: proxiedFunctionsModule,
    path: path.dirname(functionsResolution.resolution),
  });

  logDebug("firebase-functions has been stubbed.", {
    functionsResolution,
  });
}

/*
 Retains a reference to the raw body buffer to allow access to the raw body for things like request
 signature validation. This is used as the "verify" function in body-parser options.
*/
function rawBodySaver(req: express.Request, res: express.Response, buf: Buffer): void {
  (req as any).rawBody = buf;
}

async function processBackground(
  trigger: CloudFunction<any>,
  reqBody: any,
  signature: SignatureType,
): Promise<void> {
  if (signature === "cloudevent") {
    return runCloudEvent(trigger, reqBody);
  }

  // All formats of the payload should carry a "data" property. The "context" property does
  // not exist in all versions. Where it doesn't exist, context is everything besides data.
  const data = reqBody.data;
  delete reqBody.data;
  const context = reqBody.context ? reqBody.context : reqBody;

  // This is due to the fact that the Firestore emulator sends payloads in a newer
  // format than production firestore.
  if (!reqBody.eventType || !reqBody.eventType.startsWith("google.storage")) {
    if (context.resource && context.resource.name) {
      logDebug("ProcessBackground: lifting resource.name from resource", context.resource);
      context.resource = context.resource.name;
    }
  }

  await runBackground(trigger, { data, context });
}

/**
 * Run the given function while redirecting logs and looking out for errors.
 */
async function runFunction(func: () => Promise<any>): Promise<any> {
  let caughtErr;
  try {
    await func();
  } catch (err: any) {
    caughtErr = err;
  }
  if (caughtErr) {
    throw caughtErr;
  }
}

async function runBackground(trigger: CloudFunction<any>, reqBody: any): Promise<any> {
  logDebug("RunBackground", reqBody);

  await runFunction(() => {
    return trigger(reqBody.data, reqBody.context);
  });
}

async function runCloudEvent(trigger: CloudFunction<any>, event: unknown): Promise<any> {
  logDebug("RunCloudEvent", event);

  await runFunction(() => {
    return trigger(event);
  });
}

async function runHTTPS(trigger: CloudFunction<any>, args: any[]): Promise<any> {
  if (args.length < 2) {
    throw new Error("Function must be passed 2 args.");
  }

  await runFunction(() => {
    return trigger(args[0], args[1]);
  });
}

/*
  This method attempts to help a developer whose code can't be loaded by suggesting
  possible fixes based on the files in their functions directory.
 */
async function moduleResolutionDetective(error: Error): Promise<void> {
  /*
  These files could all potentially exist, if they don't then the value in the map will be
  falsey, so we just catch to keep from throwing.
   */
  const clues = {
    tsconfigJSON: await requireAsync("./tsconfig.json", { paths: [process.cwd()] }).catch(noOp),
    packageJSON: await requireAsync("./package.json", { paths: [process.cwd()] }).catch(noOp),
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

async function initializeRuntime(): Promise<void> {
  FUNCTION_DEBUG_MODE = process.env.FUNCTION_DEBUG_MODE || "";

  if (!FUNCTION_DEBUG_MODE) {
    FUNCTION_TARGET_NAME = process.env.FUNCTION_TARGET || "";
    if (!FUNCTION_TARGET_NAME) {
      new EmulatorLog(
        "FATAL",
        "runtime-status",
        `Environment variable FUNCTION_TARGET cannot be empty. This shouldn't happen.`,
      ).log();
      await flushAndExit(1);
    }

    FUNCTION_SIGNATURE = process.env.FUNCTION_SIGNATURE_TYPE || "";
    if (!FUNCTION_SIGNATURE) {
      new EmulatorLog(
        "FATAL",
        "runtime-status",
        `Environment variable FUNCTION_SIGNATURE_TYPE cannot be empty. This shouldn't happen.`,
      ).log();
      await flushAndExit(1);
    }
  }

  const verified = await verifyDeveloperNodeModules();
  if (!verified) {
    // If we can't verify the node modules, then just leave, something bad will happen during runtime.
    new EmulatorLog(
      "INFO",
      "runtime-status",
      `Your functions could not be parsed due to an issue with your node_modules (see above)`,
    ).log();
    return;
  }

  initializeRuntimeConfig();
  initializeNetworkFiltering();
  await initializeFunctionsConfigHelper();
  await initializeFirebaseFunctionsStubs();
  await initializeFirebaseAdminStubs();
}

async function loadTriggers(): Promise<any> {
  let triggerModule;
  try {
    triggerModule = require(process.cwd());
  } catch (err: any) {
    if (err.code !== "ERR_REQUIRE_ESM") {
      // Try to run diagnostics to see what could've gone wrong before rethrowing the error.
      await moduleResolutionDetective(err);
      throw err;
    }
    const modulePath = require.resolve(process.cwd());
    // Resolve module path to file:// URL. Required for windows support.
    const moduleURL = pathToFileURL(modulePath).href;
    triggerModule = await dynamicImport(moduleURL);
  }
  return triggerModule;
}

async function flushAndExit(code: number) {
  await EmulatorLog.waitForFlush();
  process.exit(code);
}

async function handleMessage(message: string) {
  let debug: FunctionsRuntimeBundle["debug"];
  try {
    debug = JSON.parse(message) as FunctionsRuntimeBundle["debug"];
  } catch (e: any) {
    new EmulatorLog("FATAL", "runtime-error", `Got unexpected message body: ${message}`).log();
    await flushAndExit(1);
    return;
  }

  if (FUNCTION_DEBUG_MODE) {
    if (debug) {
      FUNCTION_TARGET_NAME = debug.functionTarget;
      FUNCTION_SIGNATURE = debug.functionSignature;
    } else {
      new EmulatorLog("WARN", "runtime-warning", "Expected debug payload while in debug mode.");
    }
  }
}

async function main(): Promise<void> {
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

  await initializeRuntime();
  try {
    functionModule = await loadTriggers();
  } catch (e: any) {
    new EmulatorLog(
      "FATAL",
      "runtime-status",
      `Failed to initialize and load triggers. This shouldn't happen: ${e.message}`,
    ).log();
    await flushAndExit(1);
  }
  const app = express();
  app.enable("trust proxy");
  // TODO: This should be 10mb for v1 functions, 32mb for v2, but there is not an easy way to check platform from here.
  const bodyParserLimit = "32mb";
  app.use(
    bodyParser.json({
      limit: bodyParserLimit,
      verify: rawBodySaver,
    }),
  );
  app.use(
    bodyParser.text({
      limit: bodyParserLimit,
      verify: rawBodySaver,
    }),
  );
  app.use(
    bodyParser.urlencoded({
      extended: true,
      limit: bodyParserLimit,
      verify: rawBodySaver,
    }),
  );
  app.use(
    bodyParser.raw({
      type: "*/*",
      limit: bodyParserLimit,
      verify: rawBodySaver,
    }),
  );
  app.get("/__/health", (req, res) => {
    res.status(200).send();
  });
  app.all("/favicon.ico|/robots.txt", (req, res) => {
    res.status(404).send();
  });
  app.all(`/*`, async (req: express.Request, res: express.Response) => {
    try {
      const trigger = FUNCTION_TARGET_NAME.split(".").reduce((mod, functionTargetPart) => {
        return mod?.[functionTargetPart];
      }, functionModule) as CloudFunction<unknown>;
      if (!trigger) {
        throw new Error(`Failed to find function ${FUNCTION_TARGET_NAME} in the loaded module`);
      }

      switch (FUNCTION_SIGNATURE) {
        case "event":
        case "cloudevent":
          let reqBody;
          const rawBody = (req as RequestWithRawBody).rawBody;
          if (EventUtils.isBinaryCloudEvent(req)) {
            reqBody = EventUtils.extractBinaryCloudEventContext(req);
            reqBody.data = req.body;
          } else {
            reqBody = JSON.parse(rawBody.toString());
          }
          await processBackground(trigger, reqBody, FUNCTION_SIGNATURE);
          res.send({ status: "acknowledged" });
          break;
        case "http":
          await runHTTPS(trigger, [req, res]);
      }
    } catch (err: any) {
      new EmulatorLog("FATAL", "runtime-error", err.stack ? err.stack : err).log();
      res.status(500).send(err.message);
    }
  });
  app.listen(process.env.PORT, () => {
    logDebug(`Listening to port: ${process.env.PORT}`);
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
  main()
    .then(() => {
      logDebug("Functions runtime initialized.", {
        cwd: process.cwd(),
        node_version: process.versions.node,
      });
    })
    .catch((err) => {
      new EmulatorLog("FATAL", "runtime-error", err.message || err, err).log();
      return flushAndExit(1);
    });
}
