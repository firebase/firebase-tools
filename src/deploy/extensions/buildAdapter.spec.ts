import { expect } from "chai";

import * as buildAdapter from "./buildAdapter";
import * as planner from "./planner";
import * as backend from "../functions/backend";
import * as functionsBuild from "../functions/build"; // Aliased import
import { ParamValue, StringParam } from "../functions/params";
import {
  ExtensionSpec,
  ExtensionConfig,
  ParamType,
  ExtensionVersion,
} from "../../extensions/types";

function mockExtensionSpec(overrides?: Partial<ExtensionSpec>): ExtensionSpec {
  return {
    name: "test-extension",
    version: "0.1.0",
    specVersion: "v1beta",
    displayName: "Test Extension",
    description: "A simple test extension",
    author: { authorName: "Firebase", url: "https://firebase.google.com/" },
    license: "Apache-2.0",
    resources: [],
    params: [],
    systemParams: [],
    apis: [],
    roles: [],
    events: [],
    billingRequired: false,
    sourceUrl: "https://github.com/firebase/extensions",
    ...overrides,
  };
}

function mockExtensionVersion(overrides?: Partial<ExtensionVersion>): ExtensionVersion {
  const spec = overrides?.spec || mockExtensionSpec();
  return {
    name: `publishers/test-publisher/extensions/${spec.name}/versions/${spec.version}`,
    ref: `test-publisher/${spec.name}@${spec.version}`,
    state: "PUBLISHED",
    spec: spec,
    hash: "fakeHash",
    sourceDownloadUri: "https://example.com/source.zip",
    createTime: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockDeploymentInstanceSpec(
  overrides?: Partial<planner.DeploymentInstanceSpec>,
): planner.DeploymentInstanceSpec {
  const defaults: planner.DeploymentInstanceSpec = {
    instanceId: "test-instance",
    params: {},
    systemParams: {},
  };
  return {
    ...defaults,
    ...overrides,
  };
}

describe("extensions/buildAdapter", () => {
  describe("createExtensionBuild", () => {
    it("should convert a basic ExtensionSpec to a Build object", () => {
      const instanceSpec = mockDeploymentInstanceSpec();
      const extSpec = mockExtensionSpec();
      const resultBuild = buildAdapter.createExtensionBuild(instanceSpec, extSpec);

      expect(resultBuild.requiredAPIs).to.deep.equal([]);
      expect(resultBuild.endpoints).to.deep.equal({});
      expect(resultBuild.params).to.deep.equal([]);
      expect(resultBuild.runtime).to.equal("nodejs20");
    });

    it("should convert extension params to function params", () => {
      const instanceSpec = mockDeploymentInstanceSpec();
      const extSpec = mockExtensionSpec({
        params: [
          {
            param: "MY_PARAM",
            label: "My Param",
            description: "A test param",
            type: ParamType.STRING,
            default: "default_value",
            required: true,
          },
        ],
        systemParams: [
          {
            param: "EXT_INSTANCE_ID",
            label: "Extension Instance ID",
            description: "The ID of this extension instance",
            type: ParamType.STRING,
            immutable: true,
          },
        ],
      });

      const resultBuild = buildAdapter.createExtensionBuild(instanceSpec, extSpec);

      expect(resultBuild.params).to.have.lengthOf(2);
      expect(resultBuild.params).to.deep.include({
        name: "MY_PARAM",
        label: "My Param",
        description: "A test param",
        type: "string",
        default: "default_value",
        input: undefined,
        immutable: undefined,
      });
      expect(resultBuild.params).to.deep.include({
        name: "EXT_INSTANCE_ID",
        label: "Extension Instance ID",
        description: "The ID of this extension instance",
        type: "string",
        default: undefined,
        input: undefined,
        immutable: true,
      });
    });

    it("should use existing instance config for param defaults", () => {
      const instanceSpec = mockDeploymentInstanceSpec();
      const extSpec = mockExtensionSpec({
        params: [{ param: "MY_PARAM", label: "My Param", type: ParamType.STRING }],
      });
      const existingInstanceConfig: ExtensionConfig = {
        name: "projects/p/instances/i/configurations/c",
        createTime: "2024-01-01T00:00:00Z",
        source: {
          name: "projects/p/sources/s",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: mockExtensionSpec(),
        },
        params: { MY_PARAM: "existing_value" },
        systemParams: {},
        extensionRef: "test/ref",
        extensionVersion: "0.1.0",
      };

      const resultBuild = buildAdapter.createExtensionBuild(
        instanceSpec,
        extSpec,
        existingInstanceConfig,
      );

      const myParam = resultBuild.params.find((p) => p.name === "MY_PARAM") as StringParam;
      expect(myParam?.default).to.equal("existing_value");
    });

    it("should convert extension expressions like ${FOO} and ${param:FOO} to {{ params.FOO }}", () => {
      const instanceSpec = mockDeploymentInstanceSpec({
        params: {
          DB_URL: "projects/_/instances/default/refs/myDb",
          DB_DOC_ID: "abc",
        },
      });
      const extSpec = mockExtensionSpec({
        params: [
          { param: "DB_URL", label: "Database URL", type: ParamType.STRING },
          { param: "DB_DOC_ID", label: "Database Document ID", type: ParamType.STRING },
        ],
        resources: [
          {
            name: "myFunction",
            type: "firebaseextensions.v1beta.function",
            properties: {
              eventTrigger: {
                eventType: "providers/google.firebase.database/eventTypes/data.write",
                resource: "${DB_URL}/documents/${param:DB_DOC_ID}",
              },
            },
          },
        ],
      });

      const resultBuild = buildAdapter.createExtensionBuild(instanceSpec, extSpec);
      const endpoints = functionsBuild.allEndpoints(resultBuild);
      expect(endpoints).to.have.length(1);
      const endpoint = endpoints[0];
      if (functionsBuild.isEventTriggered(endpoint)) {
        expect(endpoint.eventTrigger.eventFilters?.resource).to.equal(
          "{{ params.DB_URL }}/documents/{{ params.DB_DOC_ID }}",
        );
      } else {
        expect.fail("endpoint unexpectedly not an event triggered endpoint", endpoint);
      }
    });
  });

  describe("backendToDeploymentInstanceSpec", () => {
    let originalInstanceSpec: planner.DeploymentInstanceSpec;

    beforeEach(() => {
      originalInstanceSpec = mockDeploymentInstanceSpec({
        instanceId: "original-instance",
        params: { PRE_EXISTING_PARAM: "original_value" },
        ref: { publisherId: "firebase", extensionId: "storage-resize-images", version: "0.1.30" },
      });
    });

    it("should convert a Backend object and resolved envs to a DeploymentInstanceSpec", () => {
      const bkend: backend.Backend = backend.empty();
      const envs: Record<string, ParamValue> = {
        PARAM1: new ParamValue("value1", false, { string: true }),
        PARAM2: new ParamValue("value2", false, { string: true }),
        EXT_INSTANCE_ID: new ParamValue("original-instance", false, { string: true }),
        FIREBASE_PROJECT_ID: new ParamValue("my-project", true, { string: true }),
      };

      const newSpec = buildAdapter.backendToDeploymentInstanceSpec(
        bkend,
        envs,
        originalInstanceSpec,
      );

      expect(newSpec.instanceId).to.equal("original-instance");
      expect(newSpec.ref).to.deep.equal(originalInstanceSpec.ref);
      expect(newSpec.params).to.deep.equal({
        PARAM1: "value1",
        PARAM2: "value2",
        EXT_INSTANCE_ID: "original-instance",
      });
      expect(newSpec.systemParams).to.deep.equal({});
      expect(newSpec.allowedEventTypes).to.be.undefined;
      expect(newSpec.eventarcChannel).to.be.undefined;
    });

    it("should handle ALLOWED_EVENT_TYPES and EVENTARC_CHANNEL correctly", () => {
      const bkend: backend.Backend = backend.empty();
      const envs: Record<string, ParamValue> = {
        ALLOWED_EVENT_TYPES: new ParamValue("type1,type2,,type3", false, { string: true }),
        EVENTARC_CHANNEL: new ParamValue("projects/p/locations/l/channels/c", false, {
          string: true,
        }),
        OTHER_PARAM: new ParamValue("other_value", false, { string: true }),
      };

      const newSpec = buildAdapter.backendToDeploymentInstanceSpec(
        bkend,
        envs,
        originalInstanceSpec,
      );

      expect(newSpec.params).to.deep.equal({ OTHER_PARAM: "other_value" });
      expect(newSpec.allowedEventTypes).to.deep.equal(["type1", "type2", "type3"]);
      expect(newSpec.eventarcChannel).to.equal("projects/p/locations/l/channels/c");
    });

    it("should handle empty ALLOWED_EVENT_TYPES as undefined", () => {
      const bkend: backend.Backend = backend.empty();
      const envs: Record<string, ParamValue> = {
        ALLOWED_EVENT_TYPES: new ParamValue("", false, { string: true }),
      };

      const newSpec = buildAdapter.backendToDeploymentInstanceSpec(
        bkend,
        envs,
        originalInstanceSpec,
      );
      expect(newSpec.allowedEventTypes).to.deep.equal([]);
    });

    it("should handle undefined ALLOWED_EVENT_TYPES as undefined", () => {
      const bkend: backend.Backend = backend.empty();
      const envs: Record<string, ParamValue> = {
        SOME_OTHER_PARAM: new ParamValue("test", false, { string: true }),
      };
      const newSpec = buildAdapter.backendToDeploymentInstanceSpec(
        bkend,
        envs,
        originalInstanceSpec,
      );
      expect(newSpec.allowedEventTypes).to.be.undefined;
    });

    it("should preserve original instance spec properties", () => {
      const bkend: backend.Backend = backend.empty();
      const envs: Record<string, ParamValue> = {
        MY_NEW_PARAM: new ParamValue("new_val", false, { string: true }),
      };
      const customOriginalSpec = mockDeploymentInstanceSpec({
        instanceId: "custom-id",
        localPath: "/path/to/extension",
        params: { OLD_PARAM: "old_value" },
        labels: { "my-label": "my-value" },
      });

      const newSpec = buildAdapter.backendToDeploymentInstanceSpec(bkend, envs, customOriginalSpec);

      expect(newSpec.instanceId).to.equal("custom-id");
      expect(newSpec.localPath).to.equal("/path/to/extension");
      expect(newSpec.labels).to.deep.equal({ "my-label": "my-value" });
      // OLD_PARAM is overwritten by new params logic
      expect(newSpec.params).to.deep.equal({ MY_NEW_PARAM: "new_val" });
    });
  });
});
