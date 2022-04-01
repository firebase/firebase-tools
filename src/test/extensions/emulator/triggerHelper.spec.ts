import { expect } from "chai";
import * as triggerHelper from "../../../extensions/emulator/triggerHelper";
import { Resource } from "../../../extensions/extensionsApi";

describe("triggerHelper", () => {
  describe("functionResourceToEmulatedTriggerDefintion", () => {
    it("should assign valid properties from the resource to the ETD and ignore others", () => {
      const testResource: Resource = {
        name: "test-resource",
        entryPoint: "functionName",
        type: "firebaseextensions.v1beta.function",
        properties: {
          timeout: "3s",
          location: "us-east1",
          availableMemoryMb: 1024,
        },
      };
      (testResource.properties as Record<string, string>).somethingInvalid = "a value";
      const expected = {
        platform: "gcfv1",
        availableMemoryMb: 1024,
        entryPoint: "test-resource",
        name: "test-resource",
        regions: ["us-east1"],
        timeoutSeconds: 3,
      };

      const result = triggerHelper.functionResourceToEmulatedTriggerDefintion(testResource);

      expect(result).to.eql(expected);
    });

    it("should handle HTTPS triggers", () => {
      const testResource: Resource = {
        name: "test-resource",
        entryPoint: "functionName",
        type: "firebaseextensions.v1beta.function",
        properties: {
          httpsTrigger: {},
        },
      };
      const expected = {
        platform: "gcfv1",
        entryPoint: "test-resource",
        name: "test-resource",
        httpsTrigger: {},
      };

      const result = triggerHelper.functionResourceToEmulatedTriggerDefintion(testResource);

      expect(result).to.eql(expected);
    });

    it("should handle firestore triggers", () => {
      const testResource: Resource = {
        name: "test-resource",
        entryPoint: "functionName",
        type: "firebaseextensions.v1beta.function",
        properties: {
          eventTrigger: {
            eventType: "providers/cloud.firestore/eventTypes/document.write",
            resource: "myResource",
          },
        },
      };
      const expected = {
        platform: "gcfv1",
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
      const testResource: Resource = {
        name: "test-resource",
        entryPoint: "functionName",
        type: "firebaseextensions.v1beta.function",
        properties: {
          eventTrigger: {
            eventType: "providers/google.firebase.database/eventTypes/ref.create",
            resource: "myResource",
          },
        },
      };
      const expected = {
        platform: "gcfv1",
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
      const testResource: Resource = {
        name: "test-resource",
        entryPoint: "functionName",
        type: "firebaseextensions.v1beta.function",
        properties: {
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "myResource",
          },
        },
      };
      const expected = {
        platform: "gcfv1",
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
