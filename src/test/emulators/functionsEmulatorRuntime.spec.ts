import { expect } from "chai";
import { InvokeRuntime } from "../../emulator/functionsEmulator";
import { EmulatorLog } from "../../emulator/types";
import { EventEmitter } from "events";

const FunctionRuntimeBundles = {
  onCreate: {
    ports: {
      firestore: 8080,
    },
    cwd: "",
    proto: {
      data: {
        value: {
          name: "projects/fir-codelab-nyk/databases/(default)/documents/test/test",
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
          name: "projects/fir-codelab-nyk/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
      },
    },
    triggerId: "function_id",
    projectId: "fir-codelab-nyk",
  },
};

async function _countLogEntries(runtime: {
  exit: Promise<number>;
  events: EventEmitter;
}): Promise<{ [key: string]: number }> {
  const counts: { [key: string]: number } = {
    "unidentified-network-access": 0,
    "googleapis-network-access": 0,
  };

  runtime.events.on("log", (el: EmulatorLog) => {
    if (el.level === "WARN") {
      process.stdout.write(el.text + " " + JSON.stringify(el.data) + "\n");
    }
    counts[el.type] = (counts[el.type] || 0) + 1;
  });

  await runtime.exit;
  return counts;
}

describe("FunctionsEmulatorRuntime", () => {
  describe("_InitializeNetworkFiltering(...)", () => {
    it("should log outgoing HTTPS requests", async () => {
      const serializedTriggers = (() => {
        return {
          function_id: require("firebase-functions")
            .firestore.document("test/test")
            .onCreate(async () => {
              await require("node-fetch")("https://jpg.cool/fish.gif");
              await new Promise((resolve) => {
                require("http").get("http://example.com", resolve);
              });
              await new Promise((resolve) => {
                require("https").get("https://example.com", resolve);
              });
            }),
        };
      }).toString();

      const logs = await _countLogEntries(
        InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, serializedTriggers)
      );

      // In Node 6 we get 4 events here, Node 8+ gets 3 because of changes to
      // HTTP libraries, either is fine because we'll whitelist / deny the request
      // after the first prompt.
      expect(logs["unidentified-network-access"]).to.gte(3);
      expect(logs["googleapis-network-access"]).to.eq(1);
    });
  });

  describe("_InitializeFirebaseAdminStubs(...)", () => {
    it("should provide stubbed default app from initializeApp", async () => {
      const serializedTriggers = (() => {
        return {
          function_id: require("firebase-functions")
            .firestore.document("test/test")
            .onCreate(async () => {
              require("firebase-admin").initializeApp();
            }),
        };
      }).toString();

      const logs = await _countLogEntries(
        InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, serializedTriggers)
      );

      expect(logs["default-admin-app-used"]).to.eq(1);
    });

    it("should provide non-stubbed non-default app from initializeApp", async () => {
      const serializedTriggers = (() => {
        return {
          function_id: require("firebase-functions")
            .firestore.document("test/test")
            .onCreate(async () => {
              require("firebase-admin").initializeApp({}, "non-default");
            }),
        };
      }).toString();

      const logs = await _countLogEntries(
        InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, serializedTriggers)
      );

      expect(logs["non-default-admin-app-used"]).to.eq(1);
    });
  });

  describe("_InitializeFunctionsConfigHelper()", () => {
    it("should tell the user if they've accessed a non-existent function field", async () => {
      const serializedTriggers = (() => {
        return {
          function_id: require("firebase-functions")
            .firestore.document("test/test")
            .onCreate(async () => {
              /* tslint:disable:no-console */
              console.log(require("firebase-functions").config().hello.world);
              console.log(require("firebase-functions").config().cat.hat);
            }),
        };
      }).toString();

      const logs = await _countLogEntries(
        InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, serializedTriggers)
      );

      expect(logs["functions-config-missing-value"]).to.eq(2);
    });
  });
});
