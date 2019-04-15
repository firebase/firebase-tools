import { expect } from "chai";
import { InvokeRuntime } from "../../emulator/functionsEmulator";
import { EmulatorLog } from "../../emulator/types";

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
    triggerId: "networking_test",
    projectId: "fir-codelab-nyk",
  },
};

describe("functions emulator runtime", () => {
  describe("network filtering", () => {
    it("should log outgoing HTTPS requests", async () => {
      const serializedTriggers = (() => {
        return {
          networking_test: require("firebase-functions")
            .firestore.document("test/test")
            .onCreate(async () => {
              await require("node-fetch")("https://jpg.cool/fish.gif");
            }),
        };
      }).toString();

      const runtime = InvokeRuntime(
        process.execPath,
        FunctionRuntimeBundles.onCreate,
        serializedTriggers
      );

      const counts: { [key: string]: number } = {
        "unidentified-network-access": 0,
        "googleapis-network-access": 0,
      };

      runtime.events.on("log", (el: EmulatorLog) => {
        if (el.level === "WARN") {
          process.stdout.write(el.text + "\n");
        }
        counts[el.text] = (counts[el.text] || 0) + 1;
      });

      await runtime.exit;

      expect(counts["unidentified-network-access"]).to.eq(1);
      expect(counts["googleapis-network-access"]).to.eq(1);
    });
  });
});
