import { expect } from "chai";

import * as http from "http";
import * as fs from "fs/promises";
import * as spawn from "cross-spawn";
import * as path from "path";
import { ChildProcess } from "child_process";

import * as express from "express";
import { Change } from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";

import { FunctionRuntimeBundles, TIMEOUT_LONG, MODULE_ROOT } from "./fixtures";
import {
  FunctionsRuntimeBundle,
  getTemporarySocketPath,
  SignatureType,
} from "../../src/emulator/functionsEmulatorShared";
import { streamToString } from "../../src/utils";

const FUNCTIONS_DIR = `./scripts/emulator-tests/functions`;
const ADMIN_SDK_CONFIG = {
  projectId: "fake-project-id",
  databaseURL: "https://fake-project-id-default-rtdb.firebaseio.com",
  storageBucket: "fake-project-id.appspot.com",
};

interface Runtime {
  proc: ChildProcess;
  port: string;
  rawMsg: string[];
  sysMsg: Record<string, string[]>;
  stdout: string[];
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function isSocketReady(socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http
      .request(
        {
          method: "GET",
          path: "/__/health",
          socketPath,
        },
        () => resolve(),
      )
      .end();
    req.on("error", (error) => {
      reject(error);
    });
  });
}

async function waitForSocketReady(socketPath: string): Promise<void> {
  const timeout = new Promise<never>((resolve, reject) => {
    setTimeout(() => {
      reject(new Error("Timeout - runtime server not ready"));
    }, 10_000);
  });
  while (true) {
    try {
      await Promise.race([isSocketReady(socketPath), timeout]);
      break;
    } catch (err: any) {
      // Allow us to wait until the server is listening.
      if (["ECONNREFUSED", "ENOENT"].includes(err?.code)) {
        await sleep(100);
        continue;
      }
      throw err;
    }
  }
}

async function startRuntime(
  triggerName: string,
  signatureType: SignatureType,
  triggerSource: () => {},
  runtimeEnvs?: Record<string, string>,
): Promise<Runtime> {
  const env: Record<string, string> = { ...runtimeEnvs };
  env.GCLOUD_PROJECT = ADMIN_SDK_CONFIG.projectId;
  env.FUNCTION_TARGET = triggerName;
  env.FUNCTION_SIGNATURE_TYPE = signatureType;
  env.PORT = getTemporarySocketPath();

  env.FIREBASE_CONFIG = JSON.stringify(ADMIN_SDK_CONFIG);
  env.FUNCTIONS_EMULATOR = "true";
  env.FIREBASE_DEBUG_MODE = "true";
  env.FIREBASE_DEBUG_FEATURES = JSON.stringify({
    skipTokenVerification: true,
    enableCors: true,
  });

  const sourceCode = `module.exports = (${triggerSource.toString()})();\n`;
  await fs.writeFile(`${FUNCTIONS_DIR}/index.js`, sourceCode);

  const args = [path.join(MODULE_ROOT, "src", "emulator", "functionsEmulatorRuntime")];
  const proc = spawn(process.execPath, args, {
    env: { ...process.env, ...env },
    cwd: FUNCTIONS_DIR,
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  const runtime: Runtime = {
    proc,
    rawMsg: [],
    sysMsg: {},
    stdout: [],
    port: env.PORT,
  };

  proc.on("message", (message) => {
    const msg = message.toString();
    runtime.rawMsg.push(msg);
    try {
      const m = JSON.parse(msg);
      if (m.type) {
        runtime.sysMsg[m.type] = runtime.sysMsg[m.type] || [];
        runtime.sysMsg[m.type].push(`text: ${m.text};data: ${JSON.stringify(m.data)}`);
      }
    } catch {
      // Carry on;
    }
  });

  proc.stdout?.on("data", (data) => {
    runtime.stdout.push(data.toString());
  });

  proc.stderr?.on("data", (data) => {
    runtime.stdout.push(data.toString());
  });

  await waitForSocketReady(env.PORT);
  return runtime;
}

interface ReqOpts {
  data?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
}

function sendEvent(runtime: Runtime, proto: any): Promise<string> {
  const reqData = JSON.stringify(proto);
  return sendReq(runtime, {
    data: reqData,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": `${reqData.length}`,
    },
  });
}

async function sendReq(runtime: Runtime, opts: ReqOpts = {}): Promise<string> {
  const path = opts.path || "/";
  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.request(
      {
        method: opts.method || "POST",
        headers: opts.headers,
        socketPath: runtime.port,
        path,
      },
      resolve,
    );
    req.on("error", reject);
    if (opts.data) {
      req.write(opts.data);
    }
    req.end();
  });
  const result = await streamToString(res);
  return result;
}

async function sendDebugBundle(runtime: Runtime, debug: FunctionsRuntimeBundle["debug"]) {
  return new Promise((resolve) => {
    runtime.proc.send(JSON.stringify(debug), resolve);
  });
}

describe("FunctionsEmulator-Runtime", function () {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(TIMEOUT_LONG);

  let runtime: Runtime | undefined;

  afterEach(() => {
    runtime?.proc.kill(9);
    runtime = undefined;
  });

  describe("Stubs, Mocks, and Helpers", () => {
    describe("_InitializeNetworkFiltering", () => {
      it("should log outgoing unknown HTTP requests via 'http'", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("http").get("http://example.com", resolve);
                });
              }),
          };
        });
        await sendEvent(runtime, FunctionRuntimeBundles.onCreate.proto);
        expect(runtime.sysMsg["unidentified-network-access"]?.length).to.gte(1);
      });

      it("should log outgoing unknown HTTP requests via 'https'", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("https").get("https://example.com", resolve);
                });
              }),
          };
        });
        await sendEvent(runtime, FunctionRuntimeBundles.onCreate.proto);
        expect(runtime.sysMsg["unidentified-network-access"]?.length).to.gte(1);
      });

      it("should log outgoing Google API requests", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("https").get("https://storage.googleapis.com", resolve);
                });
              }),
          };
        });
        await sendEvent(runtime, FunctionRuntimeBundles.onCreate.proto);
        expect(runtime.sysMsg["googleapis-network-access"]?.length).to.gte(1);
      });
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      it("should provide stubbed default app from initializeApp", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {
                console.log("hello world");
              }),
          };
        });
        await sendEvent(runtime, FunctionRuntimeBundles.onCreate.proto);
        expect(runtime.sysMsg["default-admin-app-used"]?.length).to.gte(1);
      });

      it("should provide a stubbed app with custom options", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp({ custom: true });
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {
                console.log("hello world");
              }),
          };
        });
        await sendEvent(runtime, FunctionRuntimeBundles.onCreate.proto);
        expect(runtime.sysMsg["default-admin-app-used"]?.length).to.gte(1);
        expect(runtime.sysMsg["default-admin-app-used"]?.join(" ")).to.match(/"custom":true/);
      });

      it("should provide non-stubbed non-default app from initializeApp", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp(); // We still need to initialize default for snapshots
          require("firebase-admin").initializeApp({}, "non-default");
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {
                console.log("hello world");
              }),
          };
        });
        await sendEvent(runtime, FunctionRuntimeBundles.onCreate.proto);
        expect(runtime.sysMsg["non-default-admin-app-used"]?.length).to.gte(1);
      });

      it("should route all sub-fields accordingly", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {
                console.log(
                  JSON.stringify(require("firebase-admin/firestore").FieldValue.increment(4)),
                );
                return Promise.resolve();
              }),
          };
        });
        await sendEvent(runtime, FunctionRuntimeBundles.onCreate.proto);
        expect(runtime.stdout.join(" ")).to.match(/{"operand":4}/);
      });

      it("should expose Firestore prod when the emulator is not running", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          const admin = require("firebase-admin");
          admin.initializeApp();
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(admin.firestore()._settings);
              return Promise.resolve();
            }),
          };
        });
        const data = await sendReq(runtime);
        const info = JSON.parse(data);
        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.be.undefined;
        expect(info.port).to.be.undefined;
      });

      it("should expose a stubbed Firestore when the emulator is running", async () => {
        runtime = await startRuntime(
          "functionId",
          "http",
          () => {
            const admin = require("firebase-admin");
            admin.initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(admin.firestore()._settings);
                return Promise.resolve();
              }),
            };
          },
          { FIRESTORE_EMULATOR_HOST: "localhost:9090" },
        );
        const data = await sendReq(runtime);
        const info = JSON.parse(data);
        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.eq("localhost");
        expect(info.port).to.eq(9090);
      });

      it("should expose RTDB prod when the emulator is not running", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          const admin = require("firebase-admin");
          admin.initializeApp();
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({
                url: admin.database().ref().toString(),
              });
            }),
          };
        });
        const data = await sendReq(runtime);
        const info = JSON.parse(data);
        expect(info.url).to.eql("https://fake-project-id-default-rtdb.firebaseio.com/");
      });

      it("should expose a stubbed RTDB when the emulator is running", async () => {
        runtime = await startRuntime(
          "functionId",
          "http",
          () => {
            const admin = require("firebase-admin");
            admin.initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json({
                  url: admin.database().ref().toString(),
                });
              }),
            };
          },
          {
            FIREBASE_DATABASE_EMULATOR_HOST: "localhost:9090",
          },
        );
        const data = await sendReq(runtime);
        const info = JSON.parse(data);
        expect(info.url).to.eql("http://localhost:9090/");
      });
    });
  });
  describe("_InitializeFunctionsConfigHelper()", () => {
    const cfgPath = path.join(FUNCTIONS_DIR, ".runtimeconfig.json");

    before(async () => {
      await fs.writeFile(cfgPath, '{"real":{"exist":"already exists" }}');
    });

    after(async () => {
      await fs.unlink(cfgPath);
    });

    it("should tell the user if they've accessed a non-existent function field", async () => {
      runtime = await startRuntime("functionId", "event", () => {
        require("firebase-admin").initializeApp();
        return {
          functionId: require("firebase-functions")
            .firestore.document("test/test")
            .onCreate(() => {
              // Exists
              console.log(require("firebase-functions").config().real);
              // Does not exist
              console.log(require("firebase-functions").config().foo);
              console.log(require("firebase-functions").config().bar);
            }),
        };
      });
      await sendEvent(runtime, FunctionRuntimeBundles.onCreate.proto);
      expect(runtime.sysMsg["functions-config-missing-value"]?.length).to.eq(2);
    });
  });
  describe("Runtime", () => {
    describe("HTTPS", () => {
      it("should handle a GET request", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({ from_trigger: true });
            }),
          };
        });

        const data = await sendReq(runtime, { method: "GET" });
        expect(JSON.parse(data)).to.deep.equal({ from_trigger: true });
      });

      it("should handle a POST request with form data", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(req.body);
            }),
          };
        });

        const reqData = "name=sparky";
        const data = await sendReq(runtime, {
          data: reqData,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": `${reqData.length}`,
          },
        });
        expect(JSON.parse(data)).to.deep.equal({ name: "sparky" });
      });

      it("should handle a POST request with JSON data", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(req.body);
            }),
          };
        });

        const reqData = '{"name": "sparky"}';
        const data = await sendReq(runtime, {
          data: reqData,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": `${reqData.length}`,
          },
        });
        expect(JSON.parse(data)).to.deep.equal({ name: "sparky" });
      });

      it("should handle a POST request with text data", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(req.body);
            }),
          };
        });

        const reqData = "name is sparky";
        const data = await sendReq(runtime, {
          data: reqData,
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": `${reqData.length}`,
          },
        });
        expect(JSON.parse(data)).to.deep.equal("name is sparky");
      });

      it("should handle a POST request with any other type", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(req.body);
            }),
          };
        });

        const reqData = "name is sparky";
        const data = await sendReq(runtime, {
          data: reqData,
          headers: {
            "Content-Type": "gibber/ish",
            "Content-Length": `${reqData.length}`,
          },
        });
        expect(JSON.parse(data).type).to.deep.equal("Buffer");
        expect(JSON.parse(data).data.length).to.deep.equal(14);
      });

      it("should handle a POST request and store rawBody", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.send(req.rawBody);
            }),
          };
        });

        const reqData = "name is sparky";
        const data = await sendReq(runtime, {
          data: reqData,
          headers: {
            "Content-Type": "gibber/ish",
            "Content-Length": `${reqData.length}`,
          },
        });
        expect(data).to.equal(reqData);
      });

      it("should forward request to Express app", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          const app = require("express")();
          app.all("/", (req: express.Request, res: express.Response) => {
            res.json({
              hello: req.header("x-hello"),
            });
          });
          return {
            functionId: require("firebase-functions").https.onRequest(app),
          };
        });

        const reqData = "name is sparky";
        const data = await sendReq(runtime, {
          data: reqData,
          headers: {
            "x-hello": "world",
          },
        });
        expect(JSON.parse(data)).to.deep.equal({ hello: "world" });
      });

      it("should handle `x-forwarded-host`", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({ hostname: req.hostname });
            }),
          };
        });

        const reqData = "name is sparky";
        const data = await sendReq(runtime, {
          data: reqData,
          headers: {
            "x-forwarded-host": "real-hostname",
          },
        });
        expect(JSON.parse(data)).to.deep.equal({ hostname: "real-hostname" });
      });
    });

    describe("Cloud Firestore", () => {
      it("should provide Change for firestore.onWrite()", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onWrite((change: Change<DocumentSnapshot>) => {
                console.log(
                  JSON.stringify({
                    before_exists: change.before.exists,
                    after_exists: change.after.exists,
                  }),
                );
                return Promise.resolve();
              }),
          };
        });

        await sendEvent(runtime, FunctionRuntimeBundles.onWrite.proto);
        expect(runtime.stdout.join(" ")).to.match(/{"before_exists":false,"after_exists":true}/);
      });

      it("should provide Change for firestore.onUpdate()", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onUpdate((change: Change<DocumentSnapshot>) => {
                console.log(
                  JSON.stringify({
                    before_exists: change.before.exists,
                    after_exists: change.after.exists,
                  }),
                );
                return Promise.resolve();
              }),
          };
        });

        await sendEvent(runtime, FunctionRuntimeBundles.onUpdate.proto);
        expect(runtime.stdout.join(" ")).to.match(/{"before_exists":true,"after_exists":true}/);
      });

      it("should provide Change for firestore.onDelete()", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onDelete((snap: DocumentSnapshot) => {
                console.log(
                  JSON.stringify({
                    snap_exists: snap.exists,
                  }),
                );
                return Promise.resolve();
              }),
          };
        });

        await sendEvent(runtime, FunctionRuntimeBundles.onDelete.proto);
        expect(runtime.stdout.join(" ")).to.match(/{"snap_exists":true}/);
      });

      it("should provide Change for firestore.onCreate()", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate((snap: DocumentSnapshot) => {
                console.log(
                  JSON.stringify({
                    snap_exists: snap.exists,
                  }),
                );
                return Promise.resolve();
              }),
          };
        });

        await sendEvent(runtime, FunctionRuntimeBundles.onUpdate.proto);
        expect(runtime.stdout.join(" ")).to.match(/{"snap_exists":true}/);
      });
    });

    describe("Error handling", () => {
      it("Should handle regular functions for Express handlers", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions").https.onRequest(() => {
              throw new Error("not a thing");
            }),
          };
        });
        try {
          await sendReq(runtime);
        } catch (e: any) {
          // Carry on
        }

        expect(runtime.sysMsg["runtime-error"]?.length).to.eq(1);
      });

      it("Should handle async functions for Express handlers", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions").https.onRequest(async () => {
              return Promise.reject(new Error("not a thing"));
            }),
          };
        });
        try {
          await sendReq(runtime);
        } catch (e: any) {
          // Carry on
        }

        expect(runtime.sysMsg["runtime-error"]?.length).to.eq(1);
      });

      it("Should handle async/runWith functions for Express handlers", async () => {
        runtime = await startRuntime("functionId", "http", () => {
          return {
            functionId: require("firebase-functions")
              .runWith({})
              .https.onRequest(async () => {
                return Promise.reject(new Error("not a thing"));
              }),
          };
        });
        try {
          await sendReq(runtime);
        } catch (e: any) {
          // Carry on
        }

        expect(runtime.sysMsg["runtime-error"]?.length).to.eq(1);
      });
    });
  });

  describe("Debug", () => {
    it("handles debug message to change function target", async () => {
      runtime = await startRuntime(
        "function0",
        "http",
        () => {
          return {
            function0: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.send("function0");
            }),
            function1: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.send("function1");
            }),
          };
        },
        {
          FUNCTION_DEBUG_MODE: "true",
        },
      );
      await sendDebugBundle(runtime, { functionSignature: "http", functionTarget: "function0" });
      const fn0Res = await sendReq(runtime);
      expect(fn0Res).to.equal("function0");
      await sendDebugBundle(runtime, { functionSignature: "http", functionTarget: "function1" });
      const fn1Res = await sendReq(runtime);
      expect(fn1Res).to.equal("function1");
    });

    it("disables configured timeout when in debug mode", async () => {
      const timeoutEnvs = {
        FUNCTIONS_EMULATOR_TIMEOUT_SECONDS: "1",
        FUNCTION_DEBUG_MODE: "true",
      };
      runtime = await startRuntime(
        "functionId",
        "http",
        () => {
          return {
            functionId: require("firebase-functions").https.onRequest(
              (req: any, resp: any): Promise<void> => {
                return new Promise((resolve) => {
                  setTimeout(() => {
                    resp.sendStatus(200);
                    resolve();
                  }, 3_000);
                });
              },
            ),
          };
        },
        timeoutEnvs,
      );
      try {
        await sendDebugBundle(runtime, {
          functionSignature: "http",
          functionTarget: "functionId",
        });
        await sendReq(runtime);
      } catch (e: any) {
        // Carry on
      }
      expect(runtime.sysMsg["runtime-error"]).to.be.undefined;
    });
  });
});
