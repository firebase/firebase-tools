import { expect } from "chai";
import * as sinon from "sinon";

import { configstore } from "../../configstore";
import { FirebaseError } from "../../error";
import * as backend from "../../deploy/functions/backend";
import * as deploymentTool from "../../deploymentTool";
import * as env from "../../functions/env";
import * as envstore from "../../functions/envstore";

describe("parseKvArgs", () => {
  it("should successfully parse kv args", () => {
    const args = ["FOO=bar", "BAR=foo=bar"];
    expect(env.parseKvArgs(args)).to.deep.equal({ FOO: "bar", BAR: "foo=bar" });
  });

  it("should throw error given invalid keys", () => {
    const args = ["FOO=bar", "X_GOOGLE_BAR=foo=bar"];
    expect(() => {
      env.parseKvArgs(args);
    }).to.throw(FirebaseError);
  });
});

describe("validateKey", () => {
  it("should accept valid keys", () => {
    const keys = ["FOO", "ABC_EFG", "A1_B2"];
    keys.forEach((key) => {
      expect(() => {
        env.validateKey(key);
      }).not.to.throw;
    });
  });

  it("should throw error given invalid keys", () => {
    const keys = ["", "A", "1F", "B=C"];
    keys.forEach((key) => {
      expect(() => {
        env.validateKey(key);
      }).not.to.throw;
    });
  });

  it("should throw error given reserved keys", () => {
    const keys = [
      "FIREBASE_CONFIG",
      "FUNCTION_TARGET",
      "FUNCTION_SIGNATURE_TYPE",
      "K_SERVICE",
      "K_REVISION",
      "PORT",
      "K_CONFIGURATION",
    ];
    keys.forEach((key) => {
      expect(() => {
        env.validateKey(key);
      }).to.throw(FirebaseError);
    });
  });

  it("should throw error given keys with reserved prefix", () => {
    expect(() => {
      env.validateKey("X_GOOGLE_");
    }).to.throw(FirebaseError);

    expect(() => {
      env.validateKey("X_GOOGLE_FOOBAR");
    }).to.throw(FirebaseError);
  });
});

describe("formatEnv", () => {
  it("should format env object in a console-friendly way", () => {
    expect(env.formatEnv({ FOO: "bar", AB1: "EFG" })).to.equal("FOO=bar\nAB1=EFG");
  });
});

describe("cloneEnvs", () => {
  let createStore: sinon.SinonStub;
  let deleteStore: sinon.SinonStub;
  let getStore: sinon.SinonStub;

  beforeEach(() => {
    createStore = sinon.stub(envstore, "createStore").rejects("Unexpected call");
    deleteStore = sinon.stub(envstore, "deleteStore").rejects("Unexpected call");
    getStore = sinon.stub(envstore, "getStore").rejects("Unexpected call");
  });

  afterEach(() => {
    createStore.restore();
    deleteStore.restore();
    getStore.restore();
  });

  it("should clone all environment variables from the source project", async () => {
    const envs = {
      FOO: "bar",
      AB1: "ab1",
    };
    const fromP = "project-1";
    const toP = "project-2";

    createStore.onFirstCall().resolves({ vars: envs });
    deleteStore.onFirstCall().resolves({});
    getStore.onFirstCall().resolves({ vars: envs });

    await env.clone({ fromProjectId: fromP, toProjectId: toP, only: [], except: [] });

    expect(createStore).to.have.been.calledOnceWithExactly(toP, env.ENVSTORE_ID, envs);
    expect(deleteStore).to.have.been.calledOnceWithExactly(toP, env.ENVSTORE_ID);
    expect(getStore).to.have.been.calledOnceWithExactly(fromP, env.ENVSTORE_ID);
  });

  it("should filter the environment variables using the only option", async () => {
    const envs = {
      A1: "aa",
      A2: "bb",
      A3: "cc",
    };
    const fromP = "project-1";
    const toP = "project-2";

    createStore.onFirstCall().resolves({ vars: envs });
    deleteStore.onFirstCall().resolves({});
    getStore.onFirstCall().resolves({ vars: envs });

    await env.clone({ fromProjectId: fromP, toProjectId: toP, only: ["A1", "A3"], except: [] });

    expect(createStore).to.have.been.calledOnceWithExactly(toP, env.ENVSTORE_ID, {
      A1: "aa",
      A3: "cc",
    });
    expect(deleteStore).to.have.been.calledOnceWithExactly(toP, env.ENVSTORE_ID);
    expect(getStore).to.have.been.calledOnceWithExactly(fromP, env.ENVSTORE_ID);
  });

  it("should filter the environment variables using the except option", async () => {
    const envs = {
      A1: "aa",
      A2: "bb",
      A3: "cc",
    };
    const fromP = "project-1";
    const toP = "project-2";

    createStore.onFirstCall().resolves({ vars: envs });
    deleteStore.onFirstCall().resolves({});
    getStore.onFirstCall().resolves({ vars: envs });

    await env.clone({ fromProjectId: fromP, toProjectId: toP, only: [], except: ["A2"] });

    expect(createStore).to.have.been.calledOnceWithExactly(toP, env.ENVSTORE_ID, {
      A1: "aa",
      A3: "cc",
    });
    expect(deleteStore).to.have.been.calledOnceWithExactly(toP, env.ENVSTORE_ID);
    expect(getStore).to.have.been.calledOnceWithExactly(fromP, env.ENVSTORE_ID);
  });

  it("should throw error if both only and except options are given", async () => {
    await expect(
      env.clone({ fromProjectId: "", toProjectId: "", only: ["A1"], except: ["A2"] })
    ).to.be.rejectedWith(FirebaseError);
  });
});

describe("check", () => {
  const projectId = "project-id";
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let fakeConfigStore: { [key: string]: any } = {};
  let getStore: sinon.SinonStub;

  beforeEach(() => {
    const configstoreGetStub = sandbox.stub(configstore, "get");
    configstoreGetStub.callsFake((key: string) => {
      return fakeConfigStore[key];
    });

    const configstoreSetStub = sandbox.stub(configstore, "set");
    configstoreSetStub.callsFake((...args: any) => {
      fakeConfigStore[args[0]] = args[1];
    });

    const configstoreDeleteStub = sandbox.stub(configstore, "delete");
    configstoreDeleteStub.callsFake((key: string) => {
      delete fakeConfigStore[key];
    });

    getStore = sandbox.stub(envstore, "getStore").rejects("Unexpected call");
  });

  afterEach(() => {
    fakeConfigStore = {};
    sandbox.restore();
  });

  it("calls EnvStore API if not active", async () => {
    getStore.onFirstCall().resolves({});

    const checkResult = await env.checkEnvStore(projectId);

    expect(checkResult).to.be.false;
    expect(getStore).to.have.been.calledOnce;
  });

  it("calls EnvStore API (and caches state) if active", async () => {
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult = await env.checkEnvStore(projectId);

    expect(checkResult).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });

  it("uses cached result on subsequent calls", async () => {
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult0 = await env.checkEnvStore(projectId);
    const checkResult1 = await env.checkEnvStore(projectId);

    expect(checkResult0).to.be.true;
    expect(checkResult1).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });

  it("calls EnvStore API if cached result has expired", async () => {
    const expiredTime = Date.now() - 1000 * 60 * 60 * 48; // 2 days ago
    fakeConfigStore = { envstore: { lastActiveAt: expiredTime } };
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult = await env.checkEnvStore(projectId);

    expect(checkResult).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });
});

describe("getUserEnvs", () => {
  let existingBackendStub: sinon.SinonStub;

  const FUNCTION_SPEC: backend.FunctionSpec = {
    id: "id",
    region: "region",
    project: "project",
    apiVersion: 1,
    trigger: {
      allowInsecure: false,
    },
    entryPoint: "function",
    runtime: "nodejs14",
  };

  beforeEach(() => {
    existingBackendStub = sinon.stub(backend, "existingBackend").rejects("Unexpected call");
  });

  afterEach(() => {
    existingBackendStub.restore();
  });

  it("picks fns with user env vars", async () => {
    const testBackend: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...FUNCTION_SPEC,
          id: "fn1",
          region: "region1",
          labels: { "deployment-tool": deploymentTool.BASE },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
            FOO: "foo",
          },
        },
        {
          ...FUNCTION_SPEC,
          id: "fn2",
          region: "region1",
          labels: { "deployment-tool": deploymentTool.BASE },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
          },
        },
        {
          ...FUNCTION_SPEC,
          id: "fn3",
          region: "region1",
          labels: { "deployment-tool": deploymentTool.BASE },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
            BAR: "bar",
          },
        },
      ],
    };
    existingBackendStub.resolves(testBackend);

    const envs = await env.getUserEnvs("project");

    expect(envs).to.deep.equal({
      "fn1(region1)": { FOO: "foo" },
      "fn3(region1)": { BAR: "bar" },
    });
  });

  it("ignores fns not managed by Firebase", async () => {
    const testBackend: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...FUNCTION_SPEC,
          id: "fn1",
          region: "region1",
          labels: { "deployment-tool": "firebase-extension" },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
            FOO: "foo",
          },
        },
        {
          ...FUNCTION_SPEC,
          id: "fn2",
          region: "region1",
          labels: { "deployment-tool": "pantheon" },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
            BAR: "bar",
          },
        },
      ],
    };
    existingBackendStub.resolves(testBackend);

    const envs = await env.getUserEnvs("project");

    expect(envs).to.deep.equal({});
  });
});

describe("findDups", () => {
  it("detects no duplicate keys if there are none.", () => {
    expect(env.findDups([{ FOO: "foo" }, { BAR: "bar" }])).to.have.members([]);
  });

  it("detects duplicate keys", () => {
    expect(
      env.findDups([
        { FOO: "foo1", BAR: "bar1", BAZ: "baz" },
        { BAR: "bar2", FOO: "foo2" },
      ])
    ).to.have.members(["FOO", "BAR"]);
  });
});
