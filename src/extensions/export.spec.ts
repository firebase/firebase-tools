import { expect } from "chai";
import * as sinon from "sinon";

import {
  functionsEnvFromInstance,
  memoryToMb,
  parameterizeProject,
  parseMemory,
  resolveMigratedMemory,
  setSecretParamsToLatest,
  ejectSecretsFromInstance,
} from "./export";
import { DeploymentInstanceSpec } from "../deploy/extensions/planner";
import { ExtensionInstance, ParamType } from "./types";
import * as secretsModule from "../deploy/extensions/secrets";
import { FirebaseError } from "../error";
import { MemoryOption } from "firebase-functions/v2/options";

describe("ext:export helpers", () => {
  describe("parameterizeProject", () => {
    const TEST_PROJECT_ID = "test-project";
    const TEST_PROJECT_NUMBER = "123456789";
    const tests: {
      desc: string;
      in: Record<string, string>;
      expected: Record<string, string>;
    }[] = [
      {
        desc: "should strip projectId",
        in: {
          param1: TEST_PROJECT_ID,
          param2: `${TEST_PROJECT_ID}.appspot.com`,
        },
        expected: {
          param1: "${param:PROJECT_ID}",
          param2: "${param:PROJECT_ID}.appspot.com",
        },
      },
      {
        desc: "should strip projectNumber",
        in: {
          param1: TEST_PROJECT_NUMBER,
          param2: `projects/${TEST_PROJECT_NUMBER}/secrets/my-secret/versions/1`,
        },
        expected: {
          param1: "${param:PROJECT_NUMBER}",
          param2: "projects/${param:PROJECT_NUMBER}/secrets/my-secret/versions/1",
        },
      },
      {
        desc: "should not affect other params",
        in: {
          param1: "A param",
          param2: `Another param`,
        },
        expected: {
          param1: "A param",
          param2: `Another param`,
        },
      },
    ];
    for (const t of tests) {
      it(t.desc, () => {
        const testSpec = {
          instanceId: "my-instance",
          params: t.in,
          systemParams: {},
        };

        expect(parameterizeProject(TEST_PROJECT_ID, TEST_PROJECT_NUMBER, testSpec)).to.deep.equal({
          instanceId: testSpec.instanceId,
          params: t.expected,
          systemParams: {},
        });
      });
    }
  });

  describe("setSecretVersionsToLatest", () => {
    const testSecretVersion = "projects/my-proj/secrets/secret-1/versions/3";
    const tests: {
      desc: string;
      params: Record<string, string>;
      expected: string;
    }[] = [
      {
        desc: "Should set active secrets to latest",
        params: { blah: testSecretVersion, notSecret: "something else" },
        expected: "projects/my-proj/secrets/secret-1/versions/latest",
      },
    ];
    for (const t of tests) {
      it(t.desc, async () => {
        const testSpec: DeploymentInstanceSpec = {
          instanceId: "my-instance",
          params: t.params,
          systemParams: {},
          extensionVersion: {
            name: "test",
            ref: "test/test@0.1.0",
            state: "PUBLISHED",
            hash: "abc123",
            sourceDownloadUri: "test.com",
            spec: {
              name: "blah",
              version: "0.1.0",
              sourceUrl: "blah.com",
              resources: [],
              params: [
                {
                  param: "blah",
                  label: "blah",
                  type: ParamType.SECRET,
                },
                {
                  param: "notSecret",
                  label: "blah",
                },
              ],
              systemParams: [],
            },
          },
        };

        const res = await setSecretParamsToLatest(testSpec);

        expect(res.params["blah"]).to.equal(t.expected);
        expect(res.params["notSecret"]).to.equal(t.params["notSecret"]);
      });
    }
  });

  describe("memoryToMb", () => {
    const testCases: { input?: string; expected: number }[] = [
      { input: "256", expected: 256 },
      { input: "512", expected: 512 },
      { input: "1024", expected: 1024 },
      { input: "256Mi", expected: 256 },
      { input: "512Mi", expected: 512 },
      { input: "512MiB", expected: 512 },
      { input: "1Gi", expected: 1024 },
      { input: "1GiB", expected: 1024 },
      { input: "2Gi", expected: 2048 },
      { input: "2GiB", expected: 2048 },
      { input: "1G", expected: 1024 },
      { input: "1GB", expected: 1024 },
      { input: "0.5Gi", expected: 512 },
      { input: "-256", expected: 0 },
      { input: "invalid", expected: 0 },
      { input: "", expected: 0 },
      { input: "   ", expected: 0 },
      { input: undefined, expected: 0 },
    ];

    for (const { input, expected } of testCases) {
      it(`should parse "${String(input)}" to ${expected} MB`, () => {
        expect(memoryToMb(input)).to.equal(expected);
      });
    }
  });

  describe("parseMemory", () => {
    const testCases: { input?: string; expected?: MemoryOption }[] = [
      { input: "256", expected: "256MiB" },
      { input: "512", expected: "512MiB" },
      { input: "1024", expected: "1GiB" },
      { input: "2048", expected: "2GiB" },
      { input: "4096", expected: "4GiB" },
      { input: "8192", expected: "8GiB" },
      { input: "16384", expected: "16GiB" },
      { input: "32768", expected: "32GiB" },
      { input: "256Mi", expected: "256MiB" },
      { input: "512Mi", expected: "512MiB" },
      { input: "512MiB", expected: "512MiB" },
      { input: "1024Mi", expected: "1GiB" },
      { input: "2048Mi", expected: "2GiB" },
      { input: "1Gi", expected: "1GiB" },
      { input: "1GiB", expected: "1GiB" },
      { input: "2Gi", expected: "2GiB" },
      { input: "2GiB", expected: "2GiB" },
      { input: "1G", expected: "1GiB" },
      { input: "1GB", expected: "1GiB" },
      { input: "0.5Gi", expected: "512MiB" },
      { input: "300", expected: undefined },
      { input: "-256", expected: undefined },
      { input: "invalid", expected: undefined },
      { input: "", expected: undefined },
      { input: "   ", expected: undefined },
      { input: undefined, expected: undefined },
    ];

    for (const { input, expected } of testCases) {
      it(`should parse "${String(input)}" to ${String(expected)}`, () => {
        expect(parseMemory(input)).to.equal(expected);
      });
    }
  });

  describe("resolveMigratedMemory", () => {
    it("should return undefined if no memory params are present", () => {
      expect(resolveMigratedMemory({}, [])).to.be.undefined;
    });

    it("should return V1 memory if only V1 is present", () => {
      expect(
        resolveMigratedMemory({ "firebaseextensions.v1beta.function/memory": "256" }, []),
      ).to.equal("256");
    });

    it("should return V2 memory if only V2 is present", () => {
      expect(
        resolveMigratedMemory({ "firebaseextensions.v1beta.v2function/memory": "512Mi" }, []),
      ).to.equal("512Mi");
    });

    it("should select the highest value when both V1 and V2 are present", () => {
      expect(
        resolveMigratedMemory(
          {
            "firebaseextensions.v1beta.function/memory": "1024",
            "firebaseextensions.v1beta.v2function/memory": "512Mi",
          },
          [],
        ),
      ).to.equal("1024");

      expect(
        resolveMigratedMemory(
          {
            "firebaseextensions.v1beta.function/memory": "256",
            "firebaseextensions.v1beta.v2function/memory": "512Mi",
          },
          [],
        ),
      ).to.equal("512Mi");
    });

    it("should fall back to spec defaults when live params are missing", () => {
      expect(
        resolveMigratedMemory({ "firebaseextensions.v1beta.function/memory": "1024" }, [
          {
            param: "firebaseextensions.v1beta.v2function/memory",
            label: "Memory",
            default: "256Mi",
          },
        ]),
      ).to.equal("1024");
    });
  });
});

describe("functionsEnvFromInstance", () => {
  it("empty baseline", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {},
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [],
            systemParams: [],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({});
  });

  it("user-defined params", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {
          foo: "foo",
          PASSWORD: "projects/1234/secrets/PASSWORD/versions/latest",
        },
        systemParams: {},
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [
              {
                param: "foo",
                label: "present in live params",
              },
              {
                param: "bar",
                label: "absent, has default",
                default: "bar",
              },
              {
                param: "baz",
                label: "absent, no default",
              },
              {
                type: ParamType.SECRET,
                param: "PASSWORD",
                label: "gcp secret binding",
              },
            ],
            systemParams: [],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      foo: "foo",
      bar: "bar",
      baz: "",
      FIREBASE_SECRET_REF_PASSWORD: "projects/1234/secrets/PASSWORD/versions/latest",
    });
  });

  it("system params", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {
          "firebaseextensions.v1beta.function/memory": "256",
        },
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [],
            systemParams: [
              // memory doesn't have to be in the source's system params to be written
              {
                param: "firebaseextensions.v1beta.function/minInstances",
                label: "not in live, but has default",
                default: "10",
              },
            ],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      EXT_MIGRATED_SYSTEM_MEMORY: "256MiB",
      EXT_MIGRATED_SYSTEM_MININSTANCES: "10",
    });
  });

  it("system params (v2 functions)", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {
          "firebaseextensions.v1beta.v2function/memory": "256",
        },
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [],
            systemParams: [
              // memory doesn't have to be in the source's system params to be written
              {
                param: "firebaseextensions.v1beta.v2function/minInstances",
                label: "not in live, but has default",
                default: "10",
              },
            ],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      EXT_MIGRATED_SYSTEM_MEMORY: "256MiB",
      EXT_MIGRATED_SYSTEM_MININSTANCES: "10",
    });
  });

  it("system params (both v1 and v2 functions, v2 higher)", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {
          "firebaseextensions.v1beta.function/memory": "256",
          "firebaseextensions.v1beta.v2function/memory": "512Mi",
        },
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [],
            systemParams: [],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      EXT_MIGRATED_SYSTEM_MEMORY: "512MiB",
    });
  });

  it("system params (both v1 and v2 functions, v1 higher)", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {
          "firebaseextensions.v1beta.function/memory": "1024",
          "firebaseextensions.v1beta.v2function/memory": "512Mi",
        },
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [],
            systemParams: [],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      EXT_MIGRATED_SYSTEM_MEMORY: "1GiB",
    });
  });

  it("system params (both v1 and v2 functions, equal memory)", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {
          "firebaseextensions.v1beta.function/memory": "256",
          "firebaseextensions.v1beta.v2function/memory": "256Mi",
        },
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [],
            systemParams: [],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      EXT_MIGRATED_SYSTEM_MEMORY: "256MiB",
    });
  });

  it("system params (v1 in live, v2 in spec defaults, v1 higher)", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {
          "firebaseextensions.v1beta.function/memory": "1024",
        },
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [],
            systemParams: [
              {
                param: "firebaseextensions.v1beta.v2function/memory",
                label: "Memory",
                default: "256Mi",
              },
            ],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      EXT_MIGRATED_SYSTEM_MEMORY: "1GiB",
    });
  });

  it("system params location should map to FUNCTION_DEFAULT_REGION", () => {
    const instance: ExtensionInstance = {
      name: "projects/1234/instances/ext1",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {},
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "storage-resize-images",
            version: "0.1.30",
            resources: [],
            params: [],
            systemParams: [
              {
                param: "firebaseextensions.v1beta.function/location",
                label: "Location",
                default: "us-central1",
              },
            ],
          },
        },
      },
    };

    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      FUNCTION_DEFAULT_REGION: "us-central1",
    });
  });

  it("eventarc special cases", () => {
    const instance: ExtensionInstance = {
      name: "",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "",
        createTime: "",
        params: {},
        systemParams: {},
        allowedEventTypes: ["firebase.extensions.storage-resize-images.v1.complete"],
        eventarcChannel: "projects/1234/locations/us-west1/channels/firebase",
        source: {
          name: "",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "",
            version: "1",
            resources: [],
            params: [],
            systemParams: [],
          },
        },
      },
    };
    const output = functionsEnvFromInstance(instance);
    expect(output).to.deep.equal({
      EXT_SELECTED_EVENTS: "firebase.extensions.storage-resize-images.v1.complete",
      EVENTARC_CHANNEL: "projects/1234/locations/us-west1/channels/firebase",
    });
  });
});

describe("ejectSecretsFromInstance", () => {
  let transferSecretToKitsStub: sinon.SinonStub;

  beforeEach(() => {
    transferSecretToKitsStub = sinon.stub(secretsModule, "transferSecretToKits");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should eject secrets successfully", async () => {
    const instance: ExtensionInstance = {
      name: "projects/my-proj/instances/my-inst",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "projects/my-proj/instances/my-inst/configurations/1",
        createTime: "",
        params: {
          API_KEY: "projects/my-proj/secrets/API_KEY/versions/1",
        },
        systemParams: {},
        source: {
          name: "sources/1",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "my-ext",
            version: "1.0.0",
            resources: [],
            params: [
              {
                param: "API_KEY",
                label: "API Key",
                type: ParamType.SECRET,
              },
            ],
            systemParams: [],
          },
        },
      },
    };

    transferSecretToKitsStub.resolves();
    const changed = await ejectSecretsFromInstance(instance);
    expect(changed).to.deep.equal({ success: ["my-proj/API_KEY"], fail: [] });
    expect(transferSecretToKitsStub).to.have.been.calledWith("my-proj", "API_KEY");
  });

  it("should record failed secret ejections without throwing", async () => {
    const instance: ExtensionInstance = {
      name: "projects/my-proj/instances/my-inst",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "projects/my-proj/instances/my-inst/configurations/1",
        createTime: "",
        params: {
          API_KEY: "projects/my-proj/secrets/API_KEY/versions/1",
        },
        systemParams: {},
        source: {
          name: "sources/1",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "my-ext",
            version: "1.0.0",
            resources: [],
            params: [
              {
                param: "API_KEY",
                label: "API Key",
                type: ParamType.SECRET,
              },
            ],
            systemParams: [],
          },
        },
      },
    };

    const permError = new FirebaseError("Forbidden", { status: 403 });
    transferSecretToKitsStub.rejects(permError);

    const changed = await ejectSecretsFromInstance(instance);
    expect(changed).to.deep.equal({ success: [], fail: ["my-proj/API_KEY"] });
  });
});
