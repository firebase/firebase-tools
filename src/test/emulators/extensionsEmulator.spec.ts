/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";

import { ExtensionsEmulator } from "../../emulator/extensionsEmulator";
import { EmulatableBackend } from "../../emulator/functionsEmulator";
import {
  Extension,
  ExtensionVersion,
  RegistryLaunchStage,
  Visibility,
} from "../../extensions/types";
import * as planner from "../../deploy/extensions/planner";

const TEST_EXTENSION: Extension = {
  name: "publishers/firebase/extensions/storage-resize-images",
  ref: "firebase/storage-resize-images",
  visibility: Visibility.PUBLIC,
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
            EVENTARC_CHANNEL: "projects/sample-project/locations/us-central1/channels/firebase",
          },
          allowedEventTypes: [
            "google.firebase.image-resize-started",
            "google.firebase.image-resize-completed",
          ],
          eventarcChannel: "projects/sample-project/locations/us-central1/channels/firebase",
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
            EVENTARC_CHANNEL: "projects/sample-project/locations/us-central1/channels/firebase",
          },
          secretEnv: [],
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
              name: "ext-ext-test-generateResizedImage",
              platform: "gcfv1",
              regions: ["us-west1"],
            },
          ],
          extension: TEST_EXTENSION,
          extensionVersion: TEST_EXTENSION_VERSION,
        },
      },
    ];
    for (const testCase of testCases) {
      it(testCase.desc, async () => {
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
