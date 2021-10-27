import { expect } from "chai";
import { getFunctionService } from "../../emulator/functionsEmulatorShared";

const baseDef = {
  id: "trigger-id",
  region: "us-central1",
  entryPoint: "fn",
  name: "name",
};

describe("FunctionsEmulatorShared", () => {
  describe("getFunctionService", () => {
    it("should get service from event trigger definition", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/my-project/topics/my-topic",
          eventType: "google.cloud.pubsub.topic.v1.messagePublished",
          service: "pubsub.googleapis.com",
        },
      };
      expect(getFunctionService(def)).to.be.eql("pubsub.googleapis.com");
    });

    it("should return unknown if trigger definition is not event-based", () => {
      const def = {
        ...baseDef,
        httpsTrigger: {},
      };
      expect(getFunctionService(def)).to.be.eql("unknown");
    });

    it("should infer pubsub service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/my-project/topics/my-topic",
          eventType: "google.cloud.pubsub.topic.v1.messagePublished",
        },
      };
      expect(getFunctionService(def)).to.be.eql("pubsub.googleapis.com");
    });

    it("should infer firestore service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/my-project/databases/(default)/documents/my-collection/{docId}",
          eventType: "providers/cloud.firestore/eventTypes/document.write",
        },
      };
      expect(getFunctionService(def)).to.be.eql("firestore.googleapis.com");
    });

    it("should infer database service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/_/instances/my-project/refs/messages/{pushId}",
          eventType: "providers/google.firebase.database/eventTypes/ref.write",
        },
      };
      expect(getFunctionService(def)).to.be.eql("firebaseio.com");
    });

    it("should infer storage service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/_/buckets/mybucket",
          eventType: "google.storage.object.finalize",
        },
      };
      expect(getFunctionService(def)).to.be.eql("storage.googleapis.com");
    });

    it("should infer auth service based on eventType", () => {
      const def = {
        ...baseDef,
        eventTrigger: {
          resource: "projects/my-project",
          eventType: "providers/firebase.auth/eventTypes/user.create",
        },
      };
      expect(getFunctionService(def)).to.be.eql("firebaseauth.googleapis.com");
    });
  });
});
