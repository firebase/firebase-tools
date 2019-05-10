import { expect } from "chai";
import { FunctionsRuntimeInstance, InvokeRuntime } from "../../emulator/functionsEmulator";
import { EmulatorLog } from "../../emulator/types";
import { request } from "http";
import { findModuleRoot, FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";
import { Change } from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/lib/providers/firestore";
const cwd = findModuleRoot("firebase-tools", __dirname);

const FunctionRuntimeBundles = {
  onCreate: {
    ports: {
      firestore: 8080,
    },
    cwd,
    proto: {
      data: {
        value: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          fields: {
            when: {
              timestampValue: "2019-04-15T16:55:48.150Z",
            },
          },
          createTime: "2019-04-15T16:56:13.737Z",
          updateTime: "2019-04-15T16:56:13.737Z",
        },
        updateMask: {},
      },
      context: {
        eventId: "7ebfb089-f549-4e1f-8312-fe843efc8be7",
        timestamp: "2019-04-15T16:56:13.737Z",
        eventType: "providers/cloud.firestore/eventTypes/document.create",
        resource: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
      },
    },
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
  onWrite: {
    ports: {
      firestore: 8080,
    },
    cwd,
    proto: {
      data: {
        value: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          fields: {
            when: {
              timestampValue: "2019-04-15T16:55:48.150Z",
            },
          },
          createTime: "2019-04-15T16:56:13.737Z",
          updateTime: "2019-04-15T16:56:13.737Z",
        },
        updateMask: {},
      },
      context: {
        eventId: "7ebfb089-f549-4e1f-8312-fe843efc8be7",
        timestamp: "2019-04-15T16:56:13.737Z",
        eventType: "providers/cloud.firestore/eventTypes/document.write",
        resource: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
      },
    },
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
  onDelete: {
    ports: {
      firestore: 8080,
    },
    cwd,
    proto: {
      data: {
        oldValue: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          fields: {
            when: {
              timestampValue: "2019-04-15T16:55:48.150Z",
            },
          },
          createTime: "2019-04-15T16:56:13.737Z",
          updateTime: "2019-04-15T16:56:13.737Z",
        },
        updateMask: {},
      },
      context: {
        eventId: "7ebfb089-f549-4e1f-8312-fe843efc8be7",
        timestamp: "2019-04-15T16:56:13.737Z",
        eventType: "providers/cloud.firestore/eventTypes/document.delete",
        resource: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
      },
    },
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
  onRequest: {
    ports: {
      firestore: 8080,
    },
    cwd,
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
};

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

function _is_verbose(runtime: FunctionsRuntimeInstance): void {
  runtime.events.on("log", (el: EmulatorLog) => {
    process.stdout.write(el.toPrettyString() + "\n");
  });
}

const TIMEOUT_LONG = 10000;
const TIMEOUT_MED = 5000;

describe("FunctionsEmulatorRuntime", () => {
  describe("Stubs, Mocks, and Helpers (aka Magic, Glee, and Awesomeness)", () => {
    describe("_InitializeNetworkFiltering(...)", () => {
      it("should log outgoing HTTPS requests", async () => {
        const serializedTriggers = (() => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await Promise.all([
                  require("node-fetch")("https://httpstat.us/302"),
                  require("node-fetch")("https://storage.googleapis.com/"),
                  new Promise((resolve) => {
                    require("http").get("http://example.com", resolve);
                  }),
                  new Promise((resolve) => {
                    require("https").get("https://example.com", resolve);
                  }),
                ]);
              }),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
          serializedTriggers,
        });
        const logs = await _countLogEntries(runtime);

        // In Node 6 we get >=5 events here, Node 8+ gets >=4 because of changes to
        // HTTP libraries, either is fine because we'll whitelist / deny the request
        // after the first prompt.

        expect(logs["unidentified-network-access"]).to.gte(3);
        expect(logs["googleapis-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      it("should provide stubbed default app from initializeApp", async () => {
        const serializedTriggers = (() => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
          serializedTriggers,
        });

        const logs = await _countLogEntries(runtime);

        expect(logs["default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide non-stubbed non-default app from initializeApp", async () => {
        const serializedTriggers = (() => {
          require("firebase-admin").initializeApp({}, "non-default");
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        }).toString();

        const logs = await _countLogEntries(
          InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, { serializedTriggers })
        );

        expect(logs["non-default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should alert when the app is not initialized", async () => {
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                require("firebase-admin")
                  .firestore()
                  .doc("a/b")
                  .get();
              }),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
          serializedTriggers,
        });

        const logs = await _countLogEntries(runtime);

        expect(logs["admin-not-initialized"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should route all sub-fields accordingly", async () => {
        const serializedTriggers = (() => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                console.log(
                  JSON.stringify(require("firebase-admin").firestore.FieldValue.increment(4))
                );
              }),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
          serializedTriggers,
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

      it("should redirect Firestore write to emulator", async () => {
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                /* tslint:disable:no-console */
                const admin = require("firebase-admin");
                admin.initializeApp();

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
        }).toString();

        const onRequestCopy = JSON.parse(
          JSON.stringify(FunctionRuntimeBundles.onRequest)
        ) as FunctionsRuntimeBundle;

        // Set the port to something crazy to avoid conflict with live emulator
        onRequestCopy.ports = { firestore: 80800 };

        const runtime = InvokeRuntime(process.execPath, onRequestCopy, {
          serializedTriggers,
        });

        await runtime.ready;

        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: "/",
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
        const serializedTriggers = (() => {
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
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
          serializedTriggers,
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

        const serializedTriggers = (() => {
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
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
          serializedTriggers,
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
        const serializedTriggers = (() => {
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
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
          serializedTriggers,
          env: {
            CLOUD_RUNTIME_CONFIG: JSON.stringify({ does: { exist: "already exists" } }),
          },
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["functions-config-missing-value"]).to.eq(2);
      }).timeout(TIMEOUT_MED);
    });
  });

  describe("Runtime", () => {
    describe("HTTPS", () => {
      it("should handle a single invocation", async () => {
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                /* tslint:disable:no-console */
                res.json({ from_trigger: true });
              }
            ),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onRequest, {
          serializedTriggers,
        });

        await runtime.ready;

        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: "/",
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
    });

    describe("Cloud Firestore", () => {
      it("should provide Change for firestore.onWrite()", async () => {
        const serializedTriggers = (() => {
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
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onWrite, {
          serializedTriggers,
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
        const serializedTriggers = (() => {
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
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onWrite, {
          serializedTriggers,
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

      it("should provide DocumentSnapshot for firestore.onDelete()", async () => {
        const serializedTriggers = (() => {
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
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onDelete, {
          serializedTriggers,
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
        const serializedTriggers = (() => {
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
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onWrite, {
          serializedTriggers,
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
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              (global as any)["not a thing"]();
            }),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onRequest, {
          serializedTriggers,
        });

        const logs = _countLogEntries(runtime);

        await runtime.ready;

        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: "/",
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
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                (global as any)["not a thing"]();
              }
            ),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onRequest, {
          serializedTriggers,
        });

        const logs = _countLogEntries(runtime);

        await runtime.ready;

        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: "/",
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
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions")
              .runWith({})
              .https.onRequest(async (req: any, res: any) => {
                (global as any)["not a thing"]();
              }),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onRequest, {
          serializedTriggers,
        });

        const logs = _countLogEntries(runtime);
        await runtime.ready;
        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: "/",
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
