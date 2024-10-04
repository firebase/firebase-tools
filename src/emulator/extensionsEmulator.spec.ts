import { expect } from "chai";
import { join } from "node:path";

import * as planner from "../deploy/extensions/planner";
import { ExtensionsEmulator } from "./extensionsEmulator";
import { EmulatableBackend } from "./functionsEmulator";
import { Extension, ExtensionVersion, RegistryLaunchStage, Visibility } from "../extensions/types";

const TEST_EXTENSION: Extension = {
  name: "publishers/firebase/extensions/storage-resize-images",
  ref: "firebase/storage-resize-images",
  visibility: Visibility.PUBLIC,
  state: "PUBLISHED",
  registryLaunchStage: RegistryLaunchStage.BETA,
  createTime: "0",
};

const TEST_EXTENSION_VERSION: ExtensionVersion = {
  name: "publishers/firebase/extensions/storage-resize-images/versions/0.1.18",
  ref: "firebase/storage-resize-images@0.1.18",
  state: "PUBLISHED",
  sourceDownloadUri: "https://fake.test",
  hash: "abc123",
  spec: {
    name: "publishers/firebase/extensions/storage-resize-images/versions/0.1.18",
    resources: [
      {
        type: "firebaseextensions.v1beta.function",
        name: "generateResizedImage",
        description: `Listens for new images uploaded to your specified Cloud Storage bucket, resizes the images,
      then stores the resized images in the same bucket. Optionally keeps or deletes the original images.`,
        properties: {
          location: "${param:LOCATION}",
          runtime: "nodejs10",
          eventTrigger: {
            eventType: "google.storage.object.finalize",
            resource: "projects/_/buckets/${param:IMG_BUCKET}",
          },
        },
      },
    ],
    params: [],
    systemParams: [],
    version: "0.1.18",
    sourceUrl: "https://fake.test",
  },
};

describe("Extensions Emulator", () => {
  describe("toEmulatableBackends", () => {
    let previousCachePath: string | undefined;
    beforeEach(() => {
      previousCachePath = process.env.FIREBASE_EXTENSIONS_CACHE_PATH;
      process.env.FIREBASE_EXTENSIONS_CACHE_PATH = "./src/test/emulators/extensions";
    });
    afterEach(() => {
      process.env.FIREBASE_EXTENSIONS_CACHE_PATH = previousCachePath;
    });
    const testCases: {
      desc: string;
      input: planner.DeploymentInstanceSpec;
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
            ALLOWED_EVENT_TYPES:
              "google.firebase.image-resize-started,google.firebase.image-resize-completed",
            EVENTARC_CHANNEL: "projects/test-project/locations/us-central1/channels/firebase",
          },
          systemParams: {},
          allowedEventTypes: [
            "google.firebase.image-resize-started",
            "google.firebase.image-resize-completed",
          ],
          eventarcChannel: "projects/test-project/locations/us-central1/channels/firebase",
          extension: TEST_EXTENSION,
          extensionVersion: TEST_EXTENSION_VERSION,
        },
        expected: {
          env: {
            LOCATION: "us-west1",
            DATABASE_INSTANCE: "test-project",
            DATABASE_URL: "https://test-project.firebaseio.com",
            EXT_INSTANCE_ID: "ext-test",
            PROJECT_ID: "test-project",
            STORAGE_BUCKET: "test-project.appspot.com",
            ALLOWED_EVENT_TYPES:
              "google.firebase.image-resize-started,google.firebase.image-resize-completed",
            EVENTARC_CHANNEL: "projects/test-project/locations/us-central1/channels/firebase",
            EVENTARC_CLOUD_EVENT_SOURCE: "projects/test-project/instances/ext-test",
          },
          secretEnv: [],
          extensionInstanceId: "ext-test",
          // use join to convert path to platform dependent path
          // so test also runs on win machines
          // eslint-disable-next-line prettier/prettier
          functionsDir: join(
            "src/test/emulators/extensions/firebase/storage-resize-images@0.1.18/functions",
          ),
          runtime: "nodejs10",
          predefinedTriggers: [
            {
              entryPoint: "generateResizedImage",
              eventTrigger: {
                eventType: "google.storage.object.finalize",
                resource: "projects/_/buckets/${param:IMG_BUCKET}",
                service: "storage.googleapis.com",
              },
              name: "ext-ext-test-generateResizedImage",
              platform: "gcfv1",
              regions: ["us-west1"],
            },
          ],
          extension: TEST_EXTENSION,
          extensionVersion: TEST_EXTENSION_VERSION,
          codebase: "ext-test",
        },
      },
    ];
    for (const testCase of testCases) {
      it(testCase.desc, async () => {
        const e = new ExtensionsEmulator({
          options: {} as any,
          projectId: "test-project",
          projectNumber: "1234567",
          projectDir: ".",
          extensions: {},
          aliases: [],
        });

        const result = await e.toEmulatableBackend(testCase.input);
        // ignore result.bin, as it is platform dependent
        delete result.bin;
        expect(result).to.deep.equal(testCase.expected);
      });
    }
  });
});
