import { expect } from "chai";

import { ExtensionsEmulator } from "../../emulator/extensionsEmulator";
import { EmulatableBackend } from "../../emulator/functionsEmulator";
import * as planner from "../../deploy/extensions/planner";

describe("Extensions Emulator", () => {
  describe("toEmulatableBackends", () => {
    let previousCachePath: string | undefined;
    beforeEach(() => {
      previousCachePath = process.env.FIREBASE_EXTENSIONS_CACHE_PATH;
      process.env.FIREBASE_EXTENSIONS_CACHE_PATH = "./extensions";
    });
    afterEach(() => {
      process.env.FIREBASE_EXTENSIONS_CACHE_PATH = previousCachePath;
    });
    const testCases: {
      desc: string;
      input: planner.InstanceSpec;
      expected: EmulatableBackend;
    }[] = [
      {
        desc: "should transform a instance spec to a backend",
        input: {
          instanceId: "ext-test",
          ref: {
            publisherId: "firebase",
            extensionId: "storage-resize-images",
            version: "0.1.18",
          },
          params: {
            LOCATION: "us-west1",
          },
        },
        expected: {
          env: {
            LOCATION: "us-west1",
            DATABASE_INSTANCE: "test-project",
            DATABASE_URL: "https://test-project.firebaseio.com",
            EXT_INSTANCE_ID: "ext-test",
            PROJECT_ID: "test-project",
            STORAGE_BUCKET: "test-project.appspot.com",
          },
          extensionInstanceId: "ext-test",
          functionsDir:
            "src/test/emulators/extensions/firebase/storage-resize-images@0.1.18/functions",
          nodeMajorVersion: 10,
          predefinedTriggers: [
            {
              entryPoint: "generateResizedImage",
              eventTrigger: {
                eventType: "google.storage.object.finalize",
                resource: "projects/_/buckets/${param:IMG_BUCKET}",
                service: "storage.googleapis.com",
              },
              name: "generateResizedImage",
              platform: "gcfv1",
              regions: ["us-west1"],
            },
          ],
        },
      },
    ];
    for (const testCase of testCases) {
      it(testCase.desc, async () => {
        process.env.FIREBASE_EXTENSIONS_CACHE_PATH = "./src/test/emulators/extensions";
        const e = new ExtensionsEmulator({
          projectId: "test-project",
          projectNumber: "1234567",
          projectDir: ".",
          extensions: {},
          aliases: [],
        });

        const result = await e.toEmulatableBackend(testCase.input);

        expect(result).to.deep.equal(testCase.expected);
      });
    }
  });
});
