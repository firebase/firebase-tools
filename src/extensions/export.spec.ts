import { expect } from "chai";
import * as sinon from "sinon";

import {
  functionsEnvFromInstance,
  parameterizeProject,
  setSecretParamsToLatest,
  ejectSecretsFromInstance,
} from "./export";
import { ensureInstanceSpec } from "./extensionsHelper";
import { DeploymentInstanceSpec } from "../deploy/extensions/planner";
import { ParamType } from "./types";
import { ExtensionInstance } from "./types";
import * as publisherApi from "./publisherApi";
import * as secretsModule from "../deploy/extensions/secrets";
import { FirebaseError } from "../error";

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
      EXT_MIGRATED_SYSTEM_MEMORY: "256",
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
      EXT_MIGRATED_SYSTEM_MEMORY: "256",
      EXT_MIGRATED_SYSTEM_MININSTANCES: "10",
    });
  });

  it("system params location should map to DEFAULT_FUNCTION_REGION", () => {
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
          "firebaseextensions.v1beta.function/location": "us-central1",
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
      DEFAULT_FUNCTION_REGION: "us-central1",
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

describe("ensureInstanceSpec", () => {
  let getExtensionVersionStub: sinon.SinonStub;

  beforeEach(() => {
    getExtensionVersionStub = sinon.stub(publisherApi, "getExtensionVersion");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return instance as is if spec already exists", async () => {
    const instance: ExtensionInstance = {
      name: "projects/p/instances/i",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "projects/p/instances/i/configurations/1",
        createTime: "",
        params: {},
        systemParams: {},
        source: {
          name: "sources/1",
          state: "ACTIVE",
          packageUri: "",
          hash: "",
          spec: {
            name: "my-ext",
            version: "0.1.0",
            resources: [],
            params: [],
            systemParams: [],
          },
        },
      },
    };

    const result = await ensureInstanceSpec(instance);
    expect(result.config.source?.spec?.name).to.equal("my-ext");
    expect(getExtensionVersionStub).to.not.have.been.called;
  });

  it("should fetch spec on demand if missing", async () => {
    const instance = {
      name: "projects/p/instances/i",
      createTime: "",
      updateTime: "",
      state: "ACTIVE",
      serviceAccountEmail: "",
      config: {
        name: "projects/p/instances/i/configurations/1",
        createTime: "",
        extensionRef: "firebase/storage-resize-images",
        extensionVersion: "0.1.30",
        params: {},
        systemParams: {},
      },
    } satisfies ExtensionInstance;

    getExtensionVersionStub.withArgs("firebase/storage-resize-images@0.1.30").resolves({
      spec: {
        name: "storage-resize-images",
        version: "0.1.30",
        resources: [],
        params: [],
        systemParams: [],
      },
    });

    const result = await ensureInstanceSpec(instance);
    expect(result.config.source?.spec?.name).to.equal("storage-resize-images");
    expect(getExtensionVersionStub).to.have.been.calledOnce;
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
    expect(changed).to.deep.equal(["my-proj/API_KEY"]);
    expect(transferSecretToKitsStub).to.have.been.calledWith("my-proj", "API_KEY");
  });

  it("should propagate errors thrown by transferSecretToKits", async () => {
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

    await expect(ejectSecretsFromInstance(instance)).to.be.rejectedWith(permError);
  });
});
