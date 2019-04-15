import * as path from "path";
import * as admin from "firebase-admin";
import {
  EmulatedTrigger,
  FunctionsRuntimeBundle,
  getTriggersFromDirectory,
} from "./functionsEmulatorShared";
import { EmulatorLog } from "./types";
import { URL } from "url";

function _InitializeNetworkFiltering(): void {
  const networkingModules = [
    { module: "http", path: ["request"] }, // Handles HTTP, HTTPS
    { module: "http", path: ["get"] }, // Handles HTTP, HTTPS
    { module: "net", path: ["connect"] }, // Handles... uhm, low level stuff?
    // { module: "http2", path: ["connect"] }, // Handles http2
    { module: "google-gax", path: ["GrpcClient"] }, // Handles Google Cloud GRPC Apis
  ];

  const results = networkingModules.map((bundle) => {
    let mod: any;
    try {
      mod = require(bundle.module);
    } catch (error) {
      return { bundle, status: "error", error };
    }

    let obj = mod;
    for (const field of bundle.path.slice(0, -1)) {
      obj = obj[field];
    }

    const method = bundle.path.slice(-1)[0];
    const original = obj[method].bind(mod);

    /* tslint:disable:only-arrow-functions */
    mod[method] = function(...args: any[]): any {
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
      if (href.indexOf("googleapis.com") !== -1) {
        new EmulatorLog("SYSTEM", "googleapis-network-access", {
          href,
          module: bundle.module,
        }).log();
      } else {
        new EmulatorLog("SYSTEM", "unidentified-network-access", {
          href,
          module: bundle.module,
        }).log();
      }

      return original(...args);
    };

    return { bundle, status: "mocked" };
  });

  new EmulatorLog("DEBUG", "Outgoing network have been stubbed.", results).log();
}

function _InitializeFirebaseAdminStubs(
  projectId: string,
  functionsDir: string,
  firestorePort: number
): admin.app.App | void {
  const adminResolve = require.resolve("firebase-admin", {
    paths: [path.join(functionsDir, "node_modules")],
  });
  const grpc = require(require.resolve("grpc", {
    paths: [path.join(functionsDir, "node_modules")],
  }));

  const localAdminModule = require(adminResolve);
  const validApp = localAdminModule.initializeApp({ projectId });

  if (firestorePort > 0) {
    validApp.firestore().settings({
      projectId,
      port: firestorePort,
      servicePath: "localhost",
      service: "firestore.googleapis.com",
      sslCreds: grpc.credentials.createInsecure(),
    });
  }

  const originalInitializeApp = localAdminModule.initializeApp.bind(localAdminModule);
  localAdminModule.initializeApp = (opts: any, name: string) => {
    {
      if (name) {
        new EmulatorLog("SYSTEM", "non-default-admin-app-used", { name }).log();
        return originalInitializeApp(opts, name);
      }
      new EmulatorLog("SYSTEM", "default-admin-app-used").log();
      return validApp;
    }
  };

  require.cache[adminResolve] = {
    exports: localAdminModule,
  };

  return validApp;
}

function _InitializeEnvironmentalVariables(projectId: string): void {
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
  process.env.FIREBASE_PROJECT = projectId;
  process.env.GCLOUD_PROJECT = projectId;
}

async function _ProcessSingleInvocation(
  app: admin.app.App,
  proto: any,
  trigger: EmulatedTrigger
): Promise<void> {
  const { Change } = require("firebase-functions");

  const newSnap =
    proto.data.value &&
    (app.firestore() as any).snapshot_(proto.data.value, new Date().toISOString(), "json");
  const oldSnap =
    proto.data.oldValue &&
    (app.firestore() as any).snapshot_(proto.data.oldValue, new Date().toISOString(), "json");

  let data;
  switch (proto.context.eventType) {
    case "providers/cloud.firestore/eventTypes/document.write":
      data = Change.fromObjects(oldSnap, newSnap);
      break;
    case "providers/cloud.firestore/eventTypes/document.delete":
      data = Change.fromObjects(oldSnap, newSnap);
      break;
    default:
      data = newSnap && oldSnap ? Change.fromObjects(oldSnap, newSnap) : newSnap;
  }

  const resourcePath = proto.context.resource.name;
  const params = _extractParamsFromPath(trigger.definition.eventTrigger.resource, resourcePath);

  const ctx = {
    eventId: proto.context.eventId,
    timestamp: proto.context.timestamp,
    params,
    auth: {},
    authType: "UNAUTHENTICATED",
  };

  new EmulatorLog("DEBUG", `Requesting a wrapped function.`).log();
  const func = trigger.getWrappedFunction();

  /* tslint:disable:no-console */
  const log = console.log;
  console.log = (...messages: any[]) => {
    new EmulatorLog("USER", messages.join(" ")).log();
  };

  let caughtErr;
  try {
    await func(data, ctx);
  } catch (err) {
    caughtErr = err;
    console.warn(caughtErr);
  }
  console.log = log;

  if (caughtErr) {
    new EmulatorLog("WARN", caughtErr.stack).log();
  }

  new EmulatorLog("INFO", "Functions execution finished!").log();
}

const wildcardRegex = new RegExp("{[^/{}]*}", "g");

function _extractParamsFromPath(wildcardPath: string, snapshotPath: string): any {
  if (!_isValidWildcardMatch(wildcardPath, snapshotPath)) {
    return {};
  }

  const wildcardKeyRegex = /{(.+)}/;
  const wildcardChunks = _trimSlashes(wildcardPath).split("/");
  const snapshotChucks = _trimSlashes(snapshotPath).split("/");
  return wildcardChunks
    .slice(-snapshotChucks.length)
    .reduce((params: { [key: string]: string }, chunk, index) => {
      const match = wildcardKeyRegex.exec(chunk);
      if (match) {
        const wildcardKey = match[1];
        const potentialWildcardValue = snapshotChucks[index];
        if (!wildcardKeyRegex.exec(potentialWildcardValue)) {
          params[wildcardKey] = potentialWildcardValue;
        }
      }
      return params;
    }, {});
}

function _isValidWildcardMatch(wildcardPath: string, snapshotPath: string): boolean {
  const wildcardChunks = _trimSlashes(wildcardPath).split("/");
  const snapshotChucks = _trimSlashes(snapshotPath).split("/");

  if (snapshotChucks.length > wildcardChunks.length) {
    return false;
  }

  const mismatchedChunks = wildcardChunks.slice(-snapshotChucks.length).filter((chunk, index) => {
    return !(wildcardRegex.exec(chunk) || chunk === snapshotChucks[index]);
  });

  return !mismatchedChunks.length;
}

function _trimSlashes(str: string): string {
  return str
    .split("/")
    .filter((c) => c)
    .join("/");
}

async function main(): Promise<void> {
  const serializedFunctionsRuntimeBundle = process.argv[2] || "{}";
  const serializedFunctionTrigger = process.argv[3];

  new EmulatorLog("INFO", "Functions runtime initialized.", {
    cwd: process.cwd(),
    node_version: process.versions.node,
  }).log();

  const frb = JSON.parse(serializedFunctionsRuntimeBundle) as FunctionsRuntimeBundle;
  new EmulatorLog("DEBUG", "FunctionsRuntimeBundle parsed", frb).log();

  _InitializeNetworkFiltering();
  _InitializeEnvironmentalVariables(frb.projectId);
  const stubbedAdminApp = _InitializeFirebaseAdminStubs(
    frb.projectId,
    frb.cwd,
    frb.ports.firestore
  );

  if (!stubbedAdminApp) {
    new EmulatorLog("FATAL", "Could not initialize stubbed admin app.").log();
    return process.exit();
  }

  let triggers: { [id: string]: EmulatedTrigger };

  if (serializedFunctionTrigger) {
    /* tslint:disable:no-eval */
    const triggerModule = eval(serializedFunctionTrigger);
    triggers = {
      [frb.triggerId]: EmulatedTrigger.fromModule(
        {
          entryPoint: frb.triggerId,
          name: frb.triggerId,
          eventTrigger: { resource: frb.proto.context.resource.name },
        },
        triggerModule()
      ),
    };
  } else {
    // TODO: Figure out what the right thing to do with FIREBASE_CONFIG is
    triggers = await getTriggersFromDirectory(
      frb.projectId,
      frb.cwd,
      JSON.parse(process.env.FIREBASE_CONFIG || "{}")
    );
  }

  if (!triggers[frb.triggerId]) {
    new EmulatorLog(
      "FATAL",
      `Could not find trigger "${frb.triggerId}" in your functions directory.`
    ).log();
    return;
  } else {
    new EmulatorLog(
      "DEBUG",
      `Trigger "${frb.triggerId}" has been found, beginning invocation!`
    ).log();
  }

  await _ProcessSingleInvocation(stubbedAdminApp, frb.proto, triggers[frb.triggerId]);
}

if (require.main === module) {
  main();
} else {
  throw new Error(
    "functionsEmulatorRuntime.js should not be required/imported. It should only be spawned via InvokeRuntime()"
  );
}