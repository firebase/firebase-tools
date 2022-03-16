import { expect } from "chai";
import { EmulatableBackend } from "../../emulator/functionsEmulator";
import * as functionsEmulatorShared from "../../emulator/functionsEmulatorShared";

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

    it("should return unknown if trigger definition is not event-based", () => {
      const def = {
        ...baseDef,
        httpsTrigger: {},
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.be.eql("unknown");
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
        "firebaseauth.googleapis.com"
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
        },
        expected: "project/dir/extensions/my-extension-instance.secret.local",
      },
      {
        desc: "should return the correct location for a CF3 backend",
        in: {
          functionsDir: "test/cf3",
          env: {},
          secretEnv: [],
        },
        expected: "test/cf3/.secret.local",
      },
    ];

    for (const t of tests) {
      it(t.desc, () => {
        expect(functionsEmulatorShared.getSecretLocalPath(t.in, testProjectDir)).to.equal(
          t.expected
        );
      });
    }
  });
});
