import { EmulatorLog } from "./types";
import { DeploymentOptions } from "firebase-functions";
import {
  EmulatedTrigger,
  EmulatedTriggerDefinition,
  EmulatedTriggerMap,
  findModuleRoot,
  FunctionsRuntimeBundle,
  FunctionsRuntimeFeatures,
  getEmulatedTriggersFromDefinitions,
  getTemporarySocketPath,
  waitForBody,
} from "./functionsEmulatorShared";
import * as express from "express";
import { extractParamsFromPath } from "./functionsEmulatorUtils";
import { spawnSync } from "child_process";
import * as path from "path";
import * as admin from "firebase-admin";

function slowRequireResolve(moduleName: string, opts?: { paths: string[] }): string {
  opts = opts || { paths: [] };
  const resolver = `console.log(require.resolve("${moduleName}"))`;
  const result = spawnSync(process.execPath, ["-e", resolver], {
    cwd: path.resolve(opts.paths.length ? opts.paths[0] : process.cwd()),
  });

  return result.stdout.toString().trim();
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
class Proxied<T> {
  proxy: any;
  private anyValue?: (target: any, key: string) => any;
  private appliedValue?: () => any;
  private rewrites: {
    [key: string]: (target: any, key: string) => any;
  } = {};

  constructor(private original: any) {
    /*
      When initialized an original object is passed. This object is supplied to both .when()
      and .any() functions so the original value of the object is accessible. When no
      .any() is provided, the original value of the object is returned when the field
      key does not match any known rewrite.
      */
    this.proxy = new Proxy(this.original, {
      get: (target, key) => {
        key = key.toString();
        if (this.rewrites[key]) {
          return this.rewrites[key](target, key);
        }

        if (this.anyValue) {
          return this.anyValue(target, key);
        }

        return this.getOriginal(target, key);
      },
      apply: (target, thisArg, argArray) => {
        if (this.appliedValue) {
          return this.appliedValue.apply(thisArg, argArray);
        } else {
          return this.applyOriginal(target, thisArg, argArray);
        }
      },
    });
  }

  when(key: string, value: (target: any, key: string) => any): Proxied<T> {
    /*
      Calling .when("a", () => "b") will rewrite obj["a"] to be equal to "b"
       */
    this.rewrites[key] = value;
    return this as Proxied<T>;
  }

  any(value: (target: any, key: string) => any): Proxied<T> {
    /*
      Calling .any(() => "b") will rewrite all fields on obj to be equal to "b"
       */
    this.anyValue = value;
    return this as Proxied<T>;
  }

  applied(value: () => any): Proxied<T> {
    /*
      Calling .applied(() => "b") will make obj() equal to "b"
       */
    this.appliedValue = value;
    return this as Proxied<T>;
  }

  getOriginal(target: any, key: string): any {
    const value = target[key];

    if (!isExists(value)) {
      return undefined;
    } else if (isConstructor(value) || typeof value !== "function") {
      return value;
    } else {
      return value.bind(target);
    }
  }

  applyOriginal(target: any, thisArg: any, argArray: any[]): any {
    return target.apply(thisArg, argArray);
  }

  finalize(): T {
    return this.proxy as T;
  }
}

function isConstructor(obj: any): boolean {
  return !!obj.prototype && !!obj.prototype.constructor.name;
}

function isExists(obj: any): boolean {
  return obj !== undefined;
}

function verifyDeveloperNodeModules(functionsDir: string): boolean {
  let pkg;
  try {
    pkg = require(`${functionsDir}/package.json`);
  } catch (err) {
    new EmulatorLog("SYSTEM", "missing-package-json", "").log();
    return false;
  }

  const modBundles = [
    { name: "firebase-admin", isDev: false, minVersion: 7 },
    { name: "firebase-functions", isDev: false, minVersion: 2 },
    { name: "firebase-functions-test", isDev: true, minVersion: 0 },
  ];

  for (const modBundle of modBundles) {
    const dependencies = pkg.dependencies || {};
    const devDependencies = pkg.devDependencies || {};
    const isInPackageJSON = dependencies[modBundle.name] || devDependencies[modBundle.name];

    /*
    If there's no reference to the module in their package.json, prompt them to install it
     */
    if (!isInPackageJSON) {
      new EmulatorLog("SYSTEM", "missing-module", "", modBundle).log();
      return false;
    }

    /*
    Once we know it's in the package.json, make sure it's actually `npm install`ed
     */
    let modResolution: string;
    try {
      modResolution = require.resolve(modBundle.name);
    } catch (err) {
      new EmulatorLog("SYSTEM", "uninstalled-module", "", modBundle).log();
      return false;
    }

    const modPackageJSON = require(path.join(
      findModuleRoot(modBundle.name, modResolution),
      "package.json"
    ));
    const modMajorVersion = parseInt((modPackageJSON.version || "0").split("."), 10);

    if (modMajorVersion < modBundle.minVersion) {
      new EmulatorLog("SYSTEM", "out-of-date-module", "", modBundle).log();
      return false;
    }
  }

  return true;
}

/*
      We mock out a ton of different paths that we can take to network I/O. It doesn't matter if they
      overlap (like TLS and HTTPS) because the dev will either whitelist, block, or allow for one
      invocation on the first prompt, so we can be aggressive here.

      Sadly, these vary a lot between Node versions and it will always be possible to route around
      this, it's not security - just a helper. A good example of something difficult to catch is
      any I/O done via node-gyp (https://github.com/nodejs/node-gyp) since that I/O will be done in
      C, we have to catch it before then (which is how the google-gax blocker could work). As of this note,
      GRPC uses a native extension to do I/O (I think because old node lacks native HTTP2?), so that's
      a place to keep an eye on. Luckily, mostly only Google uses GRPC and most Google APIs go via
      google-gax which is mocked elsewhere, but still.

      So yeah, we'll try our best and hopefully we can catch 90% of requests.
     */
function InitializeNetworkFiltering(frb: FunctionsRuntimeBundle): void {
  const networkingModules = [
    { name: "http", module: require("http"), path: ["request"] },
    { name: "http", module: require("http"), path: ["get"] },
    { name: "https", module: require("https"), path: ["request"] },
    { name: "https", module: require("https"), path: ["get"] },
    { name: "net", module: require("net"), path: ["connect"] },
    // HTTP2 is not currently mocked due to the inability to quiet Experiment warnings in Node.
  ];

  try {
    const gcFirestore = findModuleRoot(
      "@google-cloud/firestore",
      slowRequireResolve("@google-cloud/firestore", { paths: [frb.cwd] })
    );
    const gaxPath = slowRequireResolve("google-gax", { paths: [gcFirestore] });
    const gaxModule = {
      module: require(gaxPath),
      path: ["GrpcClient"],
      name: "google-gax",
    };

    networkingModules.push(gaxModule);
    new EmulatorLog("DEBUG", "runtime-status", `Found google-gax at ${gaxPath}`).log();
  } catch (err) {
    new EmulatorLog(
      "DEBUG",
      "runtime-status",
      `Couldn't find google-cloud/firestore or google-gax`
    ).log();
  }

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
    obj[method] = function(...args: any[]): any {
      const hrefs = args
        .map((arg) => {
          if (typeof arg === "string") {
            try {
              const _ = new URL(arg);
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

      if (href && !history[href]) {
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
        const newed = new original(...args);
        if (bundle.name === "google-gax") {
          const cs = newed.constructSettings;
          newed.constructSettings = (...csArgs: any[]) => {
            (csArgs[3] as any).authorization = "Bearer owner";
            return cs.bind(newed)(...csArgs);
          };
        }

        return newed;
      }
    };

    return { name: bundle.name, status: "mocked" };
  });

  new EmulatorLog("DEBUG", "runtime-status", "Outgoing network have been stubbed.", results).log();
}

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
function InitializeFirebaseFunctionsStubs(functionsDir: string): void {
  const firebaseFunctionsResolution = slowRequireResolve("firebase-functions", {
    paths: [functionsDir],
  });
  const firebaseFunctionsRoot = findModuleRoot("firebase-functions", firebaseFunctionsResolution);
  const httpsProviderResolution = path.join(firebaseFunctionsRoot, "lib/providers/https");

  const httpsProvider = require(httpsProviderResolution);
  const _onRequestWithOpts = httpsProvider._onRequestWithOpts;

  httpsProvider._onRequestWithOpts = (
    handler: (req: Request, resp: Response) => void,
    opts: DeploymentOptions
  ) => {
    const cf = _onRequestWithOpts(handler, opts);
    cf.__emulator_func = handler;
    return cf;
  };

  /*
    If you take a look at the link above, you'll see that onRequest relies on _onRequestWithOpts
    so in theory, we should only need to mock _onRequestWithOpts, however that is not the case
    because onRequest is defined in the same scope as _onRequestWithOpts, so replacing
    the definition of _onRequestWithOpts does not replace the link to the original function
    which onRequest uses, so we need to manually force it to use our error-handle-able version.
     */
  httpsProvider.onRequest = (handler: (req: Request, resp: Response) => void) => {
    return httpsProvider._onRequestWithOpts(handler, {});
  };
}

/*
    This stub is the most important and one of the only non-optional stubs. This feature redirects
    writes from the admin SDK back into emulated resources. Currently, this is only Firestore writes.
    To do this, we replace initializeApp so it drops the developers config options and returns a restricted,
    unauthenticated app.

    We also mock out .settings() so we can merge the emulator settings with the developer's.

    If you ever see an error from the admin SDK related to default credentials, that means this mock is
    failing in some way and admin is attempting to access prod resources. This error isn't pretty,
    but it's hard to catch and better than accidentally talking to prod.
   */
function InitializeFirebaseAdminStubs(frb: FunctionsRuntimeBundle): typeof admin {
  const adminResolution = slowRequireResolve("firebase-admin", { paths: [frb.cwd] });
  const grpc = require(slowRequireResolve("grpc", { paths: [frb.cwd] }));

  const localAdminModule = require(adminResolution);
  const validApp = localAdminModule.initializeApp({ projectId: frb.projectId });

  let hasInitializedSettings = false;
  const initializeSettings = (app: admin.app.App, userSettings: any) => {
    const isEnabled = isFeatureEnabled(frb, "admin_stubs");

    if (!isEnabled) {
      if (!hasInitializedSettings) {
        app.firestore().settings(userSettings);
      }
      return;
    }

    if (!hasInitializedSettings && frb.ports.firestore) {
      app.firestore().settings({
        projectId: frb.projectId,
        port: frb.ports.firestore,
        servicePath: "localhost",
        service: "firestore.googleapis.com",
        sslCreds: grpc.credentials.createInsecure(),
        ...userSettings,
      });
    } else if (!frb.ports.firestore && frb.triggerId) {
      new EmulatorLog(
        "WARN",
        "runtime-status",
        "The Cloud Firestore emulator is not running so database operations will fail with a " +
          "'default credentials' error."
      ).log();
    }
    hasInitializedSettings = true;
  };

  const adminModuleProxy = new Proxied<typeof admin>(localAdminModule)
    .when("initializeApp", (adminModuleTarget) => (opts: any, appName: any) => {
      if (appName) {
        new EmulatorLog("SYSTEM", "non-default-admin-app-used", "", { appName }).log();
        return adminModuleTarget.initializeApp(opts, appName);
      }
      new EmulatorLog("SYSTEM", "default-admin-app-used", "").log();
      return validApp;
    })
    .when("firestore", (adminModuleTarget) => {
      const proxied = new Proxied<typeof admin.firestore>(adminModuleTarget.firestore);
      return proxied
        .applied(() => {
          return new Proxied(adminModuleTarget.firestore())
            .when("settings", () => {
              return (settings: any) => {
                initializeSettings(adminModuleTarget.app(), settings);
              };
            })
            .any((target, field) => {
              initializeSettings(adminModuleTarget.app(), {});
              return proxied.getOriginal(target, field);
            })
            .finalize();
        })
        .finalize();
    })
    .finalize();

  require.cache[adminResolution] = {
    exports: adminModuleProxy,
  };

  new EmulatorLog("DEBUG", "runtime-status", "firebase-admin has been stubbed.", {
    adminResolution,
  }).log();
  return adminModuleProxy;
}

/*
  Here we set up some environment configs, but more importantly, we break GOOGLE_APPLICATION_CREDENTIALS
  and FIREBASE_CONFIG so that there's no way we (google-auth) can automatically auth. This is a safety
  fallback for situations where a stub does not properly redirect to the emulator and we attempt to
  access a production resource. By removing the auth fields, we help reduce the risk of this situation.
   */
function ProtectEnvironmentalVariables(): void {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
}

function InitializeEnvironmentalVariables(projectId: string): void {
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
  process.env.FIREBASE_PROJECT = projectId;
  process.env.GCLOUD_PROJECT = projectId;
}

function InitializeFunctionsConfigHelper(functionsDir: string): void {
  const functionsResolution = slowRequireResolve("firebase-functions", { paths: [functionsDir] });

  const ff = require(functionsResolution);
  new EmulatorLog("DEBUG", "runtime-status", "Checked functions.config()", {
    config: ff.config(),
  }).log();

  const originalConfig = ff.config();
  const proxiedConfig = new Proxied(originalConfig)
    .any((parentConfig, parentKey) => {
      new EmulatorLog("DEBUG", "runtime-status", "config() parent accessed!", {
        parentKey,
        parentConfig,
      }).log();

      return new Proxied(parentConfig[parentKey] || ({} as { [key: string]: any }))
        .any((childConfig, childKey) => {
          const value = childConfig[childKey];
          if (value) {
            return value;
          } else {
            const valuePath = [parentKey, childKey].join(".");
            new EmulatorLog("SYSTEM", "functions-config-missing-value", "", { valuePath }).log();
            return undefined;
          }
        })
        .finalize();
    })
    .finalize();

  ff.config = () => proxiedConfig;
}

async function ProcessHTTPS(frb: FunctionsRuntimeBundle, trigger: EmulatedTrigger): Promise<void> {
  const ephemeralServer = express();
  const socketPath = getTemporarySocketPath(process.pid);

  await new Promise((resolveEphemeralServer, rejectEphemeralServer) => {
    const handler = async (req: express.Request, res: express.Response) => {
      try {
        new EmulatorLog("DEBUG", "runtime-status", `Ephemeral server used!`).log();
        const func = trigger.getRawFunction();

        res.on("finish", () => {
          instance.close();
          resolveEphemeralServer();
        });

        // Read data and manually set the request body
        const dataStr = await waitForBody(req);
        if (dataStr && dataStr.length > 0) {
          if (req.is("application/json")) {
            new EmulatorLog(
              "DEBUG",
              "runtime-status",
              `Detected JSON request body: ${dataStr}`
            ).log();
            req.body = JSON.parse(dataStr);
          } else {
            req.body = dataStr;
          }
        }

        await Run([req, res], func);
      } catch (err) {
        rejectEphemeralServer(err);
      }
    };

    ephemeralServer.get("/*", handler);
    ephemeralServer.post("/*", handler);

    const instance = ephemeralServer.listen(socketPath, () => {
      new EmulatorLog("SYSTEM", "runtime-status", "ready", { socketPath }).log();
    });
  });
}

async function ProcessBackground(
  frb: FunctionsRuntimeBundle,
  stubbedAdminModule: typeof admin,
  trigger: EmulatedTrigger
): Promise<void> {
  const { Change } = require("firebase-functions");
  new EmulatorLog("SYSTEM", "runtime-status", "ready").log();

  const proto = frb.proto;

  stubbedAdminModule.firestore().settings({});
  const snapshot_ = (stubbedAdminModule.firestore() as any).snapshot_;

  const resourcePath = proto.context.resource.name;
  const params = extractParamsFromPath(trigger.definition.eventTrigger.resource, resourcePath);

  /*
  We use an internal Firestore method snapshot_ to generate Snapshots which we pass to firebase-function's
  Change object. If we have a value for new / old snap, then we create a valid snapshot, otherwise we
  invoke snapshot_ with a different signature describe here...
  https://github.com/googleapis/nodejs-firestore/blob/114de25d1af3fc7441da3242f6bc8cc8354ffa09/dev/test/index.ts#L574
  To create a snapshot where .exists() fails.
   */

  let newSnap;
  if (proto.data.value) {
    newSnap = snapshot_(proto.data.value, new Date().toISOString(), "json");
  } else {
    newSnap = snapshot_(resourcePath, new Date().toISOString(), "json");
  }

  let oldSnap;
  if (proto.data.oldValue) {
    oldSnap = snapshot_(proto.data.oldValue, new Date().toISOString(), "json");
  } else {
    oldSnap = snapshot_(resourcePath, new Date().toISOString(), "json");
  }

  let data;
  switch (trigger.definition.eventTrigger.eventType) {
    case "providers/cloud.firestore/eventTypes/document.write":
      data = Change.fromObjects(oldSnap, newSnap);
      break;
    case "providers/cloud.firestore/eventTypes/document.update":
      data = Change.fromObjects(oldSnap, newSnap);
      break;
    case "providers/cloud.firestore/eventTypes/document.delete":
      data = oldSnap;
      break;
    case "providers/cloud.firestore/eventTypes/document.create":
      data = newSnap;
      break;
  }

  const ctx = {
    eventId: proto.context.eventId,
    timestamp: proto.context.timestamp,
    params,
    auth: {},
    authType: "UNAUTHENTICATED",
  };

  new EmulatorLog("DEBUG", "runtime-status", `Requesting a wrapped function.`).log();

  const fftResolution = require.resolve("firebase-functions-test");
  const func = trigger.getWrappedFunction(require(fftResolution));

  await Run([data, ctx], func);
}

// TODO(abehaskins): This signature could probably use work lol
async function Run(args: any[], func: (a: any, b: any) => Promise<any>): Promise<any> {
  if (args.length < 2) {
    throw new Error("Function must be passed 2 args.");
  }

  /* tslint:disable:no-console */
  const log = console.log;
  console.log = (...messages: any[]) => {
    new EmulatorLog("USER", "function-log", messages.join(" ")).log();
  };

  let caughtErr;
  try {
    await func(args[0], args[1]);
  } catch (err) {
    caughtErr = err;
  }
  console.log = log;

  new EmulatorLog("DEBUG", "runtime-status", `Ephemeral server survived.`).log();
  if (caughtErr) {
    throw caughtErr;
  }

  return;
}

function isFeatureEnabled(
  frb: FunctionsRuntimeBundle,
  feature: keyof FunctionsRuntimeFeatures
): boolean {
  return frb.disabled_features ? !frb.disabled_features[feature] : true;
}

async function main(): Promise<void> {
  const serializedFunctionsRuntimeBundle = process.argv[2] || "{}";
  const serializedFunctionTrigger = process.argv[3];

  new EmulatorLog("DEBUG", "runtime-status", "Functions runtime initialized.", {
    cwd: process.cwd(),
    node_version: process.versions.node,
  }).log();

  const frb = JSON.parse(serializedFunctionsRuntimeBundle) as FunctionsRuntimeBundle;

  if (frb.triggerId) {
    new EmulatorLog("INFO", "runtime-status", `Beginning execution of "${frb.triggerId}"`, {
      frb,
    }).log();
  }

  new EmulatorLog(
    "DEBUG",
    "runtime-status",
    `Disabled runtime features: ${JSON.stringify(frb.disabled_features)}`
  ).log();

  const verified = verifyDeveloperNodeModules(frb.cwd);
  if (!verified) {
    // If we can't verify the node modules, then just leave, soemthing bad will happen during runtime.
    new EmulatorLog(
      "INFO",
      "runtime-status",
      `Your functions could not be parsed due to an issue with your node_modules (see above)`
    ).log();
    return;
  }

  InitializeEnvironmentalVariables(frb.projectId);
  if (isFeatureEnabled(frb, "protect_env")) {
    ProtectEnvironmentalVariables();
  }

  if (isFeatureEnabled(frb, "network_filtering")) {
    InitializeNetworkFiltering(frb);
  }

  if (isFeatureEnabled(frb, "functions_config_helper")) {
    InitializeFunctionsConfigHelper(frb.cwd);
  }

  InitializeFirebaseFunctionsStubs(frb.cwd);
  const stubbedAdminModule = InitializeFirebaseAdminStubs(frb);

  let triggers: EmulatedTriggerMap;
  const triggerDefinitions: EmulatedTriggerDefinition[] = [];
  let triggerModule;

  if (serializedFunctionTrigger) {
    /* tslint:disable:no-eval */
    triggerModule = eval(serializedFunctionTrigger)();
  } else {
    triggerModule = require(frb.cwd);
  }

  require("../extractTriggers")(triggerModule, triggerDefinitions);
  triggers = await getEmulatedTriggersFromDefinitions(triggerDefinitions, triggerModule);
  new EmulatorLog("SYSTEM", "triggers-parsed", "", { triggers, triggerDefinitions }).log();

  if (!frb.triggerId) {
    /*
      This is a purely diagnostic call, it's used as a check to make sure developer code compiles and runs as
      expected, so we don't have any function to invoke.
     */
    return;
  }

  if (!triggers[frb.triggerId]) {
    new EmulatorLog(
      "FATAL",
      "runtime-status",
      `Could not find trigger "${frb.triggerId}" in your functions directory.`
    ).log();
    return;
  } else {
    new EmulatorLog(
      "DEBUG",
      "runtime-status",
      `Trigger "${frb.triggerId}" has been found, beginning invocation!`
    ).log();
  }

  const trigger = triggers[frb.triggerId];
  new EmulatorLog("DEBUG", "runtime-status", "", trigger.definition).log();
  const mode = trigger.definition.httpsTrigger ? "HTTPS" : "BACKGROUND";

  new EmulatorLog("DEBUG", "runtime-status", `Running ${frb.triggerId} in mode ${mode}`).log();

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
        `Your function timed out after ~${trigger.definition.timeout ||
          "60s"}. To configure this timeout, see
      https://firebase.google.com/docs/functions/manage-functions#set_timeout_and_memory_allocation.`
      ).log();
      process.exit();
    }, trigger.timeoutMs);
  }

  switch (mode) {
    case "BACKGROUND":
      await ProcessBackground(frb, stubbedAdminModule, triggers[frb.triggerId]);
      break;
    case "HTTPS":
      await ProcessHTTPS(frb, triggers[frb.triggerId]);
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

if (require.main === module) {
  main().catch((err) => {
    new EmulatorLog("FATAL", "runtime-error", err.stack ? err.stack : err).log();
    process.exit();
  });
}
