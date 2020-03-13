import { expect } from "chai";
import * as triggerHelper from "../../../extensions/emulator/triggerHelper";

describe("triggerHelper", () => {
  describe("functionResourceToEmulatedTriggerDefintion", () => {
    it("should assign valid properties from the resource to the ETD and ignore others", () => {
      const testResource = {
        name: "test-resource",
        entryPoint: "functionName",
        properties: {
          timeout: "3s",
          location: "us-east1",
          availableMemoryMb: 1024,
          somethingInvalid: "a value",
        },
      };
      const expected = {
        availableMemoryMb: 1024,
        entryPoint: "test-resource",
        name: "test-resource",
        regions: ["us-east1"],
        timeout: "3s",
      };

      const result = triggerHelper.functionResourceToEmulatedTriggerDefintion(testResource);

      expect(result).to.eql(expected);
    });

    it("should handle HTTPS triggers", () => {
      const testResource = {
        name: "test-resource",
        entryPoint: "functionName",
        properties: {
          httpsTrigger: {},
        },
      };
      const expected = {
        entryPoint: "test-resource",
        name: "test-resource",
        httpsTrigger: {},
      };

      const result = triggerHelper.functionResourceToEmulatedTriggerDefintion(testResource);

      expect(result).to.eql(expected);
    });

    it("should handle firestore triggers", () => {
      const testResource = {
        name: "test-resource",
        entryPoint: "functionName",
        properties: {
          eventTrigger: {
            eventType: "providers/cloud.firestore/eventTypes/document.write",
            resource: "myResource",
          },
        },
      };
      const expected = {
        entryPoint: "test-resource",
        name: "test-resource",
        eventTrigger: {
          service: "firestore.googleapis.com",
          resource: "myResource",
          eventType: "providers/cloud.firestore/eventTypes/document.write",
        },
      };

      const result = triggerHelper.functionResourceToEmulatedTriggerDefintion(testResource);

      expect(result).to.eql(expected);
    });

    it("should handle database triggers", () => {
      const testResource = {
        name: "test-resource",
        entryPoint: "functionName",
        properties: {
          eventTrigger: {
            eventType: "providers/google.firebase.database/eventTypes/ref.create",
            resource: "myResource",
          },
        },
      };
      const expected = {
        entryPoint: "test-resource",
        name: "test-resource",
        eventTrigger: {
          eventType: "providers/google.firebase.database/eventTypes/ref.create",
          service: "firebaseio.com",
          resource: "myResource",
        },
      };

      const result = triggerHelper.functionResourceToEmulatedTriggerDefintion(testResource);

      expect(result).to.eql(expected);
    });

    it("should handle pubsub triggers", () => {
      const testResource = {
        name: "test-resource",
        entryPoint: "functionName",
        properties: {
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "myResource",
          },
        },
      };
      const expected = {
        entryPoint: "test-resource",
        name: "test-resource",
        eventTrigger: {
          service: "pubsub.googleapis.com",
          resource: "myResource",
          eventType: "google.pubsub.topic.publish",
        },
      };

      const result = triggerHelper.functionResourceToEmulatedTriggerDefintion(testResource);

      expect(result).to.eql(expected);
    });
  });
});
