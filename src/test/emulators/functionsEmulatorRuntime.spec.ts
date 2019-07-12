import { expect } from "chai";
import {
  FunctionsRuntimeInstance,
  InvokeRuntime,
  InvokeRuntimeOpts,
} from "../../emulator/functionsEmulator";
import { EmulatorLog } from "../../emulator/types";
import { request } from "http";
import { FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";
import { Change } from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/lib/providers/firestore";
import { FunctionRuntimeBundles, TIMEOUT_LONG, TIMEOUT_MED } from "./fixtures";
import * as express from "express";
import * as _ from "lodash";

async function _countLogEntries(
  runtime: FunctionsRuntimeInstance
): Promise<{ [key: string]: number }> {
  const counts: { [key: string]: number } = {};

  runtime.events.on("log", (el: EmulatorLog) => {
    counts[el.type] = (counts[el.type] || 0) + 1;
  });

  await runtime.exit;
  return counts;
}

function InvokeRuntimeWithFunctions(
  frb: FunctionsRuntimeBundle,
  triggers: () => {},
  opts?: InvokeRuntimeOpts
): FunctionsRuntimeInstance {
  const serializedTriggers = triggers.toString();

  return InvokeRuntime(process.execPath, frb, {
    ...opts,
    serializedTriggers,
  });
}

function _is_verbose(runtime: FunctionsRuntimeInstance): void {
  runtime.events.on("log", (el: EmulatorLog) => {
    process.stdout.write(el.toPrettyString() + "\n");
  });
}

describe("FunctionsEmulator-Runtime", () => {
  describe("Stubs, Mocks, and Helpers (aka Magic, Glee, and Awesomeness)", () => {
    describe("_InitializeNetworkFiltering(...)", () => {
      it("should log outgoing unknown HTTP requests via 'http'", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  // tslint:disable-next-line:no-console
                  console.log(require("http").get.toString());
                  require("http").get("http://example.com", resolve);
                });
              }),
          };
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["unidentified-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing unknown HTTP requests via 'https'", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("https").get("https://example.com", resolve);
                });
              }),
          };
        });

        const logs = await _countLogEntries(runtime);

        expect(logs["unidentified-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing Google API requests", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("https").get("https://storage.googleapis.com", resolve);
                });
              }),
          };
        });

        const logs = await _countLogEntries(runtime);

        expect(logs["googleapis-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      it("should provide stubbed default app from initializeApp", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide non-stubbed non-default app from initializeApp", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp(); // We still need to initialize default for snapshots
          require("firebase-admin").initializeApp({}, "non-default");
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        });
        const logs = await _countLogEntries(runtime);
        expect(logs["non-default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should route all sub-fields accordingly", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                // tslint:disable-next-line:no-console
                console.log(
                  JSON.stringify(require("firebase-admin").firestore.FieldValue.increment(4))
                );
              }),
          };
        });

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ operand: 4 });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide a stubbed Firestore through admin.firestore()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();
          const firestore = admin.firestore();

          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                // Need to use the Firestore object in order to trigger init.
                const ref = firestore.collection("foo").doc("bar");
                return true;
              }),
          };
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["set-firestore-settings"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide a stubbed Firestore through app.firestore()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          const admin = require("firebase-admin");
          const app = admin.initializeApp();
          const firestore = app.firestore();

          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                // Need to use the Firestore object in order to trigger init.
                const ref = firestore.collection("foo").doc("bar");
                return true;
              }),
          };
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["set-firestore-settings"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should redirect Firestore write to emulator", async () => {
        const onRequestCopy = _.cloneDeep(
          FunctionRuntimeBundles.onRequest
        ) as FunctionsRuntimeBundle;

        // Set the port to something crazy to avoid conflict with live emulator
        onRequestCopy.ports = { firestore: 80800 };

        const runtime = InvokeRuntimeWithFunctions(onRequestCopy, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                try {
                  await admin
                    .firestore()
                    .collection("test")
                    .add({ date: new Date() });
                  res.json({ from_trigger: true });
                } catch (e) {
                  res.json({ error: e.message });
                }
              }
            ),
          };
        });

        await runtime.ready;
        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${onRequestCopy.projectId}/us-central1/${onRequestCopy.triggerId}`,
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data).error).to.exist;
                resolve();
              });
            }
          ).end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should merge .settings() with emulator settings", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();
          admin.firestore().settings({
            timestampsInSnapshots: true,
          });

          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        });

        runtime.events.on("log", (el: EmulatorLog) => {
          expect(el.text.indexOf("You can only call settings() once")).to.eq(-1);
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should merge .initializeApp arguments from user", async () => {
        // This test causes very odd behavior in Travis, for now we'll disable it in CI until we can investigate
        if (process.env.CI) {
          return;
        }

        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          const admin = require("firebase-admin");
          admin.initializeApp({
            databaseURL: "fake-app-id.firebaseio.com",
          });

          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async (snap: any, ctx: any) => {
                admin
                  .database()
                  .ref("write-test")
                  .set({
                    date: new Date(),
                  });
              }),
          };
        });

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(
            el.text.indexOf(
              "Please ensure that you spelled the name of your " +
                "Firebase correctly (https://fake-app-id.firebaseio.com)"
            )
          ).to.gte(0);
          runtime.kill();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);
    });

    describe("_InitializeFunctionsConfigHelper()", () => {
      it("should tell the user if they've accessed a non-existent function field", async () => {
        const runtime = InvokeRuntimeWithFunctions(
          FunctionRuntimeBundles.onCreate,
          () => {
            require("firebase-admin").initializeApp();
            return {
              function_id: require("firebase-functions")
                .firestore.document("test/test")
                .onCreate(async () => {
                  /* tslint:disable:no-console */
                  console.log(require("firebase-functions").config().doesnt.exist);
                  console.log(require("firebase-functions").config().does.exist);
                  console.log(require("firebase-functions").config().also_doesnt.exist);
                }),
            };
          },
          {
            env: {
              CLOUD_RUNTIME_CONFIG: JSON.stringify({
                does: { exist: "already exists" },
              }),
            },
          }
        );

        const logs = await _countLogEntries(runtime);
        expect(logs["functions-config-missing-value"]).to.eq(2);
      }).timeout(TIMEOUT_MED);
    });
  });

  describe("Runtime", () => {
    describe("HTTPS", () => {
      it("should handle a GET request", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json({ from_trigger: true });
              }
            ),
          };
        });

        await runtime.ready;
        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}/`,
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data)).to.deep.equal({ from_trigger: true });
                resolve();
              });
            }
          ).end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with form data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json(req.body);
              }
            ),
          };
        });

        await runtime.ready;

        await new Promise((resolve) => {
          const reqData = "name=sparky";
          const req = request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
              method: "post",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": reqData.length,
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data)).to.deep.equal({ name: "sparky" });
                resolve();
              });
            }
          );
          req.write(reqData);
          req.end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with JSON data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json(req.body);
              }
            ),
          };
        });

        await runtime.ready;
        await new Promise((resolve) => {
          const reqData = '{"name": "sparky"}';
          const req = request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
              method: "post",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": reqData.length,
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data)).to.deep.equal({ name: "sparky" });
                resolve();
              });
            }
          );
          req.write(reqData);
          req.end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with text data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json(req.body);
              }
            ),
          };
        });

        await runtime.ready;
        await new Promise((resolve) => {
          const reqData = "name is sparky";
          const req = request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
              method: "post",
              headers: {
                "Content-Type": "text/plain",
                "Content-Length": reqData.length,
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data)).to.deep.equal("name is sparky");
                resolve();
              });
            }
          );
          req.write(reqData);
          req.end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with any other type", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json(req.body);
              }
            ),
          };
        });

        await runtime.ready;
        await new Promise((resolve) => {
          const reqData = "name is sparky";
          const req = request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
              method: "post",
              headers: {
                "Content-Type": "gibber/ish",
                "Content-Length": reqData.length,
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data).type).to.deep.equal("Buffer");
                expect(JSON.parse(data).data.length).to.deep.equal(14);
                resolve();
              });
            }
          );
          req.write(reqData);
          req.end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request and store rawBody", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.send(req.rawBody);
              }
            ),
          };
        });

        await runtime.ready;
        await new Promise((resolve) => {
          const reqData = "How are you?";
          const req = request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
              method: "post",
              headers: {
                "Content-Type": "gibber/ish",
                "Content-Length": reqData.length,
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(data).to.equal(reqData);
                resolve();
              });
            }
          );
          req.write(reqData);
          req.end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should forward request to Express app", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          const app = require("express")();
          app.get("/", (req: express.Request, res: express.Response) => {
            res.json(req.query);
          });
          return {
            function_id: require("firebase-functions").https.onRequest(app),
          };
        });

        await runtime.ready;
        await new Promise((resolve) => {
          const req = request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}?hello=world`,
              method: "get",
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data)).to.deep.equal({ hello: "world" });
                resolve();
              });
            }
          );
          req.end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should handle `x-forwarded-host`", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json({ hostname: req.hostname });
              }
            ),
          };
        });

        await runtime.ready;
        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
              headers: {
                "x-forwarded-host": "real-hostname",
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data)).to.deep.equal({ hostname: "real-hostname" });
                resolve();
              });
            }
          ).end();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);
    });

    describe("Cloud Firestore", () => {
      it("should provide Change for firestore.onWrite()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onWrite, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onWrite(async (change: Change<DocumentSnapshot>) => {
                /* tslint:disable:no-console */
                console.log(
                  JSON.stringify({
                    before_exists: change.before.exists,
                    after_exists: change.after.exists,
                  })
                );
              }),
          };
        });

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ before_exists: false, after_exists: true });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide Change for firestore.onUpdate()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onUpdate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onUpdate(async (change: Change<DocumentSnapshot>) => {
                /* tslint:disable:no-console */
                console.log(
                  JSON.stringify({
                    before_exists: change.before.exists,
                    after_exists: change.after.exists,
                  })
                );
              }),
          };
        });

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ before_exists: true, after_exists: true });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide DocumentSnapshot for firestore.onDelete()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onDelete, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onDelete(async (snap: DocumentSnapshot) => {
                /* tslint:disable:no-console */
                console.log(
                  JSON.stringify({
                    snap_exists: snap.exists,
                  })
                );
              }),
          };
        });

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ snap_exists: true });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide DocumentSnapshot for firestore.onCreate()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onWrite, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async (snap: DocumentSnapshot) => {
                /* tslint:disable:no-console */
                console.log(
                  JSON.stringify({
                    snap_exists: snap.exists,
                  })
                );
              }),
          };
        });

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ snap_exists: true });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);
    });

    describe("Error handling", () => {
      it("Should handle regular functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              (global as any)["not a thing"]();
            }),
          };
        });

        const logs = _countLogEntries(runtime);

        await runtime.ready;
        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
            },
            (res) => {
              res.on("end", resolve);
              res.on("error", resolve);
            }
          )
            .on("error", resolve)
            .end();
        });

        await runtime.exit;
        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                (global as any)["not a thing"]();
              }
            ),
          };
        });

        const logs = _countLogEntries(runtime);

        await runtime.ready;
        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
            },
            (res) => {
              res.on("end", resolve);
              res.on("error", resolve);
            }
          )
            .on("error", resolve)
            .end();
        });

        await runtime.exit;
        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async/runWith functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .runWith({})
              .https.onRequest(async (req: any, res: any) => {
                (global as any)["not a thing"]();
              }),
          };
        });

        const logs = _countLogEntries(runtime);
        await runtime.ready;
        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: `/${frb.projectId}/us-central1/${frb.triggerId}`,
            },
            (res) => {
              res.on("end", resolve);
              res.on("error", resolve);
            }
          )
            .on("error", resolve)
            .end();
        });
        await runtime.exit;
        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);
    });
  });
});
