import { expect } from "chai";
import * as backend from "../deploy/functions/backend";
import { Constants } from "./constants";
import { BackendInfo, EmulatableBackend } from "./functionsEmulator";
import * as functionsEmulatorShared from "./functionsEmulatorShared";
import * as experiments from "../experiments";
import * as events from "../functions/events";
import {
  Extension,
  ExtensionSpec,
  ExtensionVersion,
  RegistryLaunchStage,
  Visibility,
} from "../extensions/types";

const baseDef = {
  platform: "gcfv1" as const,
  id: "trigger-id",
  region: "us-central1",
  entryPoint: "fn",
  name: "name",
};

describe("FunctionsEmulatorShared", () => {
  afterEach(() => {
    experiments.setEnabled("fscEventTriggers", null);
  });

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

    it("should infer eventarc service for dataconnect eventType when fscEventTriggers is enabled", () => {
      experiments.setEnabled("fscEventTriggers", true);
      const def: functionsEmulatorShared.ParsedTriggerDefinition = {
        ...baseDef,
        platform: "gcfv2",
        eventTrigger: {
          eventType: events.v2.DATACONNECT_EVENT,
          eventFilters: {
            service: "svc-one",
            connector: "conn-two",
            operation: "CreateUser",
          },
        },
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.equal(Constants.SERVICE_EVENTARC);
    });

    it("should return empty service for dataconnect eventType when fscEventTriggers is disabled", () => {
      experiments.setEnabled("fscEventTriggers", false);
      const def: functionsEmulatorShared.ParsedTriggerDefinition = {
        ...baseDef,
        platform: "gcfv2",
        eventTrigger: {
          eventType: events.v2.DATACONNECT_EVENT,
          eventFilters: {
            service: "svc-one",
            connector: "conn-two",
            operation: "CreateUser",
          },
        },
      };
      expect(functionsEmulatorShared.getFunctionService(def)).to.equal("");
    });
  });

  describe(`${functionsEmulatorShared.getServiceFromEventType.name}`, () => {
    it("should return eventarc service for google.firebase.dataconnect.* when fscEventTriggers is enabled", () => {
      experiments.setEnabled("fscEventTriggers", true);
      expect(functionsEmulatorShared.getServiceFromEventType(events.v2.DATACONNECT_EVENT)).to.equal(
        Constants.SERVICE_EVENTARC,
      );
      expect(
        functionsEmulatorShared.getServiceFromEventType(
          "google.firebase.dataconnect.database.v1.custom",
        ),
      ).to.equal(Constants.SERVICE_EVENTARC);
    });

    it("should return empty string for google.firebase.dataconnect.* when fscEventTriggers is disabled", () => {
      experiments.setEnabled("fscEventTriggers", false);
      expect(functionsEmulatorShared.getServiceFromEventType(events.v2.DATACONNECT_EVENT)).to.equal(
        "",
      );
      expect(
        functionsEmulatorShared.getServiceFromEventType(
          "google.firebase.dataconnect.database.v1.custom",
        ),
      ).to.equal("");
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

  describe(`${functionsEmulatorShared.eventServiceImplemented.name}`, () => {
    it("should return true for v2 auth events", () => {
      expect(
        functionsEmulatorShared.eventServiceImplemented("google.firebase.auth.user.v2.created"),
      ).to.be.true;
      expect(
        functionsEmulatorShared.eventServiceImplemented("google.firebase.auth.user.v2.deleted"),
      ).to.be.true;
    });

    it("should return true for dataconnect events only when fscEventTriggers is enabled", () => {
      experiments.setEnabled("fscEventTriggers", false);
      expect(functionsEmulatorShared.eventServiceImplemented(events.v2.DATACONNECT_EVENT)).to.be
        .false;

      experiments.setEnabled("fscEventTriggers", true);
      expect(functionsEmulatorShared.eventServiceImplemented(events.v2.DATACONNECT_EVENT)).to.be
        .true;
    });
  });

  describe(`${functionsEmulatorShared.emulatedFunctionsFromEndpoints.name}`, () => {
    const dataConnectEndpoint: backend.Endpoint = {
      id: "onMutate",
      region: "us-central1",
      project: "test-project",
      entryPoint: "onMutateEntry",
      platform: "gcfv2",
      eventTrigger: {
        eventType: events.v2.DATACONNECT_EVENT,
        eventFilters: {
          service: "svc-alpha",
          connector: "conn-beta",
          operation: "CreateRecord",
        },
        retry: false,
      },
    };

    it("skips gcfv2 dataconnect event triggers when fscEventTriggers is disabled", () => {
      experiments.setEnabled("fscEventTriggers", false);

      expect(
        functionsEmulatorShared.emulatedFunctionsFromEndpoints([dataConnectEndpoint]),
      ).to.deep.equal([]);
    });

    it("includes gcfv2 dataconnect event triggers when fscEventTriggers is enabled", () => {
      experiments.setEnabled("fscEventTriggers", true);
      const unfilteredEndpoint: backend.Endpoint = {
        id: "onAnyMutate",
        region: "us-east1",
        project: "test-project",
        entryPoint: "onAnyMutateEntry",
        platform: "gcfv2",
        eventTrigger: {
          eventType: events.v2.DATACONNECT_EVENT,
          retry: false,
        },
      };

      const defs = functionsEmulatorShared.emulatedFunctionsFromEndpoints([
        dataConnectEndpoint,
        unfilteredEndpoint,
      ]);

      expect(defs).to.have.lengthOf(2);
      expect(defs[0].id).to.equal("us-central1-onMutate");
      expect(defs[0].eventTrigger).to.deep.equal({
        eventType: events.v2.DATACONNECT_EVENT,
        resource: undefined,
        channel: undefined,
        eventFilters: {
          service: "svc-alpha",
          connector: "conn-beta",
          operation: "CreateRecord",
        },
        eventFilterPathPatterns: undefined,
      });
      expect(defs[1].id).to.equal("us-east1-onAnyMutate");
      expect(defs[1].eventTrigger?.eventType).to.equal(events.v2.DATACONNECT_EVENT);
    });
  });

  describe(`${functionsEmulatorShared.getEventTenantId.name}`, () => {
    it("should extract tenant ID from top-level CloudEvent attribute", () => {
      const event = {
        specversion: "1.0",
        type: "google.firebase.auth.user.v2.created",
        tenantid: "tenant-top-level",
        data: { value: { uid: "user-1" } },
      };
      expect(functionsEmulatorShared.getEventTenantId(event)).to.equal("tenant-top-level");
    });

    it("should return undefined when top-level tenantid attribute is absent", () => {
      const event = {
        type: "google.firebase.auth.user.v2.created",
        data: { value: { uid: "user-1", tenantId: "tenant-nested" } },
      };
      expect(functionsEmulatorShared.getEventTenantId(event)).to.be.undefined;
    });

    it("should return undefined when payload is null, undefined, or non-object", () => {
      expect(functionsEmulatorShared.getEventTenantId(null)).to.be.undefined;
      expect(functionsEmulatorShared.getEventTenantId(undefined)).to.be.undefined;
      expect(
        functionsEmulatorShared.getEventTenantId("invalid" as unknown as Record<string, unknown>),
      ).to.be.undefined;
    });
  });
});
