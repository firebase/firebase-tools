import { expect } from "chai";
import { BackendInfo, EmulatableBackend } from "../../emulator/functionsEmulator";
import * as functionsEmulatorShared from "../../emulator/functionsEmulatorShared";
import {
  Extension,
  ExtensionSpec,
  ExtensionVersion,
  RegistryLaunchStage,
  Visibility,
} from "../../extensions/types";

const baseDef = {
  platform: "gcfv1" as const,
  id: "trigger-id",
  region: "us-central1",
  entryPoint: "fn",
  name: "name",
};

describe("FunctionsEmulatorShared", () => {
  describe(`${functionsEmulatorShared.getFunctionService.name}`, () => {
    it("should get service from event trigger definition", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/my-project/topics/my-topic",
          eventType: "google.cloud.pubsub.topic.v1.messagePublished",
          service: "pubsub.googleapis.com",
        },
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.be.eql("pubsub.googleapis.com");
    });

    it("should infer https service from http trigger", () => {
      const def = {
        ...baseDef,
        httpsTrigger: {},
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.be.eql("https");
    });

    it("should infer pubsub service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/my-project/topics/my-topic",
          eventType: "google.cloud.pubsub.topic.v1.messagePublished",
        },
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.be.eql("pubsub.googleapis.com");
    });

    it("should infer firestore service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/my-project/databases/(default)/documents/my-collection/{docId}",
          eventType: "providers/cloud.firestore/eventTypes/document.write",
        },
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.be.eql("firestore.googleapis.com");
    });

    it("should infer database service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/_/instances/my-project/refs/messages/{pushId}",
          eventType: "providers/google.firebase.database/eventTypes/ref.write",
        },
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.be.eql("firebaseio.com");
    });

    it("should infer storage service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/_/buckets/mybucket",
          eventType: "google.storage.object.finalize",
        },
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.be.eql("storage.googleapis.com");
    });

    it("should infer auth service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/my-project",
          eventType: "providers/firebase.auth/eventTypes/user.create",
        },
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.be.eql(
        "firebaseauth.googleapis.com",
      );
    });
  });

  describe(`${functionsEmulatorShared.getSecretLocalPath.name}`, () => {
    const testProjectDir = "project/dir";
    const tests: {
      desc: string;
      in: EmulatableBackend;
      expected: string;
    }[] = [
      {
        desc: "should return the correct location for an Extension backend",
        in: {
          functionsDir: "extensions/functions",
          env: {},
          secretEnv: [],
          extensionInstanceId: "my-extension-instance",
          codebase: "",
        },
        expected: "project/dir/extensions/my-extension-instance.secret.local",
      },
      {
        desc: "should return the correct location for a CF3 backend",
        in: {
          functionsDir: "test/cf3",
          env: {},
          secretEnv: [],
          codebase: "",
        },
        expected: "test/cf3/.secret.local",
      },
    ];

    for (const t of tests) {
      it(t.desc, () => {
        expect(functionsEmulatorShared.getSecretLocalPath(t.in, testProjectDir)).to.equal(
          t.expected,
        );
      });
    }
  });

  describe(`${functionsEmulatorShared.toBackendInfo.name}`, () => {
    const testCF3Triggers: functionsEmulatorShared.ParsedTriggerDefinition[] = [
      {
        entryPoint: "cf3",
        platform: "gcfv1",
        name: "cf3-trigger",
        codebase: "",
      },
    ];
    const testExtTriggers: functionsEmulatorShared.ParsedTriggerDefinition[] = [
      {
        entryPoint: "ext",
        platform: "gcfv1",
        name: "ext-trigger",
      },
    ];
    const testSpec: ExtensionSpec = {
      name: "my-extension",
      version: "0.1.0",
      resources: [],
      sourceUrl: "test.com",
      params: [],
      systemParams: [],
      postinstallContent: "Should subsitute ${param:KEY}",
    };
    const testSubbedSpec: ExtensionSpec = {
      name: "my-extension",
      version: "0.1.0",
      resources: [],
      sourceUrl: "test.com",
      params: [],
      systemParams: [],
      postinstallContent: "Should subsitute value",
    };
    const testExtension: Extension = {
      name: "my-extension",
      ref: "pubby/my-extensions",
      state: "PUBLISHED",
      createTime: "",
      visibility: Visibility.PUBLIC,
      registryLaunchStage: RegistryLaunchStage.BETA,
    };
    const testExtensionVersion = (spec: ExtensionSpec): ExtensionVersion => {
      return {
        name: "my-extension",
        ref: "pubby/my-extensions@0.1.0",
        state: "PUBLISHED",
        spec,
        hash: "abc123",
        sourceDownloadUri: "test.com",
      };
    };

    const tests: {
      desc: string;
      in: EmulatableBackend;
      expected: BackendInfo;
    }[] = [
      {
        desc: "should transform a published Extension backend",
        in: {
          functionsDir: "test",
          env: {
            KEY: "value",
          },
          secretEnv: [],
          predefinedTriggers: testExtTriggers,
          extension: testExtension,
          extensionVersion: testExtensionVersion(testSpec),
          extensionInstanceId: "my-instance",
          codebase: "",
        },
        expected: {
          directory: "test",
          env: {
            KEY: "value",
          },
          functionTriggers: testExtTriggers,
          extension: testExtension,
          extensionVersion: testExtensionVersion(testSubbedSpec),
          extensionInstanceId: "my-instance",
        },
      },
      {
        desc: "should transform a local Extension backend",
        in: {
          functionsDir: "test",
          env: {
            KEY: "value",
          },
          secretEnv: [],
          predefinedTriggers: testExtTriggers,
          extensionSpec: testSpec,
          extensionInstanceId: "my-local-instance",
          codebase: "",
        },
        expected: {
          directory: "test",
          env: {
            KEY: "value",
          },
          functionTriggers: testExtTriggers,
          extensionSpec: testSubbedSpec,
          extensionInstanceId: "my-local-instance",
        },
      },
      {
        desc: "should transform a CF3 backend",
        in: {
          functionsDir: "test",
          env: {
            KEY: "value",
          },
          secretEnv: [],
          codebase: "",
        },
        expected: {
          directory: "test",
          env: {
            KEY: "value",
          },
          functionTriggers: testCF3Triggers,
        },
      },
      {
        desc: "should add secretEnvVar into env",
        in: {
          functionsDir: "test",
          env: {
            KEY: "value",
          },
          secretEnv: [
            {
              key: "secret",
              secret: "asecret",
              projectId: "test",
            },
          ],
          codebase: "",
        },
        expected: {
          directory: "test",
          env: {
            KEY: "value",
            secret: "projects/test/secrets/asecret/versions/latest",
          },
          functionTriggers: testCF3Triggers,
        },
      },
    ];

    for (const tc of tests) {
      it(tc.desc, () => {
        expect(functionsEmulatorShared.toBackendInfo(tc.in, testCF3Triggers)).to.deep.equal(
          tc.expected,
        );
      });
    }
  });
});
