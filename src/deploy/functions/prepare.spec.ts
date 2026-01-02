import { expect } from "chai";
import * as sinon from "sinon";
import * as build from "./build";
import * as prepare from "./prepare";
import * as runtimes from "./runtimes";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as serviceusage from "../../gcp/serviceusage";
import * as prompt from "../../prompt";
import { RuntimeDelegate } from "./runtimes";
import { FirebaseError } from "../../error";
import { ValidatedConfig } from "../../functions/projectConfig";
import * as functionsEnv from "../../functions/env";
import { BEFORE_CREATE_EVENT, BEFORE_SIGN_IN_EVENT } from "../../functions/events/v1";
import { latest } from "./runtimes/supported";
import * as path from "path";
import * as prepareFunctionsUpload from "./prepareFunctionsUpload";
import * as remoteSource from "./remoteSource";

describe("prepare", () => {
  const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv2",
    id: "id",
    region: "region",
    project: "project",
    entryPoint: "entry",
    runtime: latest("nodejs"),
  };

  const ENDPOINT: backend.Endpoint = {
    ...ENDPOINT_BASE,
    httpsTrigger: {},
  };

  describe("loadCodebases", () => {
    let sandbox: sinon.SinonSandbox;
    let runtimeDelegateStub: RuntimeDelegate;
    let discoverBuildStub: sinon.SinonStub;
    let getRemoteSourceStub: sinon.SinonStub;
    let loadUserEnvsStub: sinon.SinonStub;

    const EXTRACTED_SOURCE_DIR = "/tmp/extracted-source";
    const DEFAULT_ENVS = { FOO: "bar" };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      discoverBuildStub = sandbox.stub();
      runtimeDelegateStub = {
        language: "nodejs",
        runtime: latest("nodejs"),
        bin: "node",
        validate: sandbox.stub().resolves(),
        build: sandbox.stub().resolves(),
        watch: sandbox.stub().resolves(() => Promise.resolve()),
        discoverBuild: discoverBuildStub,
      };
      discoverBuildStub.resolves(
        build.of({
          test: {
            platform: "gcfv2",
            entryPoint: "test",
            project: "project",
            runtime: latest("nodejs"),
            httpsTrigger: {},
          },
        }),
      );
      sandbox.stub(runtimes, "getRuntimeDelegate").resolves(runtimeDelegateStub);
      getRemoteSourceStub = sandbox.stub(remoteSource, "getRemoteSource").resolves(EXTRACTED_SOURCE_DIR);
      sandbox.stub(remoteSource, "requireFunctionsYaml");
      loadUserEnvsStub = sandbox.stub(functionsEnv, "loadUserEnvs").returns(DEFAULT_ENVS);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should apply the prefix to the function name", async () => {
      const config: ValidatedConfig = [
        { source: "source", codebase: "codebase", prefix: "my-prefix", runtime: "nodejs22" },
      ];
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = {};

      const { builds } = await prepare.loadCodebases({
        projectId: "project",
        projectDir: "/project",
        config,
        firebaseConfig,
        runtimeConfig,
      });

      expect(Object.keys(builds.codebase.endpoints)).to.deep.equal(["my-prefix-test"]);
    });

    it("should preserve runtime from codebase config", async () => {
      const config: ValidatedConfig = [
        { source: "source", codebase: "codebase", runtime: "nodejs20" },
      ];
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = {};

      const { builds } = await prepare.loadCodebases({
        projectId: "project",
        projectDir: "/project",
        config,
        firebaseConfig,
        runtimeConfig,
      });

      expect(builds.codebase.runtime).to.equal("nodejs20");
    });

    it("should pass only firebase config when disallowLegacyRuntimeConfig is true", async () => {
      const config: ValidatedConfig = [
        {
          source: "source",
          codebase: "codebase",
          disallowLegacyRuntimeConfig: true,
          runtime: "nodejs22",
        },
      ];
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = { firebase: firebaseConfig, customKey: "customValue" };

      await prepare.loadCodebases({
        projectId: "project",
        projectDir: "/project",
        config,
        firebaseConfig,
        runtimeConfig,
      });

      expect(discoverBuildStub.calledOnce).to.be.true;
      const callArgs = discoverBuildStub.firstCall.args;
      expect(callArgs[0]).to.deep.equal({ firebase: firebaseConfig });
      expect(callArgs[0]).to.not.have.property("customKey");
    });

    it("should pass full runtime config when disallowLegacyRuntimeConfig is false", async () => {
      const config: ValidatedConfig = [
        {
          source: "source",
          codebase: "codebase",
          disallowLegacyRuntimeConfig: false,
          runtime: "nodejs22",
        },
      ];
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = { firebase: firebaseConfig, customKey: "customValue" };

      await prepare.loadCodebases({
        projectId: "project",
        projectDir: "/project",
        config,
        firebaseConfig,
        runtimeConfig,
      });

      expect(discoverBuildStub.calledOnce).to.be.true;
      const callArgs = discoverBuildStub.firstCall.args;
      expect(callArgs[0]).to.deep.equal(runtimeConfig);
      expect(callArgs[0]).to.have.property("customKey", "customValue");
    });

    it("should handle remote sources by extracting and discovering", async () => {
      const config: ValidatedConfig = [
        {
          codebase: "remote",
          remoteSource: { repository: "user/repo", ref: "main" },
          runtime: "nodejs20",
        },
      ];
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = { firebase: firebaseConfig };

      const { builds, sourceDirs, envs } = await prepare.loadCodebases({
        projectId: "project",
        projectDir: "/project",
        config,
        firebaseConfig,
        runtimeConfig,
      });

      expect(remoteSource.getRemoteSource).to.have.been.calledWith(
        /* repository= */ "user/repo",
        /* ref= */ "main",
        /* destDir= */ sinon.match.string,
        /* subDir= */ undefined,
      );
      expect(builds.remote).to.exist;
      expect(sourceDirs.remote).to.equal(EXTRACTED_SOURCE_DIR);
      expect(envs.remote).to.deep.equal({});
    });

    it("should pass configDir to loadUserEnvs for remote sources", async () => {
      const config: ValidatedConfig = [
        {
          codebase: "remote",
          remoteSource: { repository: "user/repo", ref: "main" },
          runtime: "nodejs20",
          configDir: "config-dir",
        },
      ];
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = { firebase: firebaseConfig };

      const { envs, sourceDirs } = await prepare.loadCodebases({
        projectId: "project",
        projectDir: "/project",
        config,
        firebaseConfig,
        runtimeConfig,
      });

      expect(sourceDirs.remote).to.equal(EXTRACTED_SOURCE_DIR);
      expect(functionsEnv.loadUserEnvs).to.have.been.calledWith(
        sinon.match({
          functionsSource: EXTRACTED_SOURCE_DIR,
          configDir: path.resolve("/project", "config-dir"),
        }),
      );
      expect(envs.remote).to.deep.equal(DEFAULT_ENVS);
    });
  });

  describe("inferDetailsFromExisting", () => {
    it("merges env vars if .env is not used", () => {
      const oldE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "old value",
          old: "value",
        },
      };
      const newE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "new value",
          new: "value",
        },
      };

      prepare.inferDetailsFromExisting(backend.of(newE), backend.of(oldE), /* usedDotenv= */ false);

      expect(newE.environmentVariables).to.deep.equals({
        old: "value",
        new: "value",
        foo: "new value",
      });
    });

    it("overwrites env vars if .env is used", () => {
      const oldE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "old value",
          old: "value",
        },
      };
      const newE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "new value",
          new: "value",
        },
      };

      prepare.inferDetailsFromExisting(backend.of(newE), backend.of(oldE), /* usedDotEnv= */ true);

      expect(newE.environmentVariables).to.deep.equals({
        new: "value",
        foo: "new value",
      });
    });

    it("can noop when there is no prior endpoint", () => {
      const e = { ...ENDPOINT };
      prepare.inferDetailsFromExisting(backend.of(e), backend.of(), /* usedDotEnv= */ false);
      expect(e).to.deep.equal(ENDPOINT);
    });

    it("can fill in regions from last deploy", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "bucket" },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.region = "us";

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.eventTrigger.region).to.equal("us");
    });

    it("doesn't fill in regions if triggers changed", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalzied",
          eventFilters: { bucket: "us-bucket" },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.eventFilters = { bucket: "us-central1-bucket" };
      have.eventTrigger.region = "us-central1";

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.eventTrigger.region).to.be.undefined;
    });

    it("fills in instance size", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint = JSON.parse(JSON.stringify(want));
      have.availableMemoryMb = 512;

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.availableMemoryMb).to.equal(512);
    });

    it("downgrades concurrency if necessary (explicit)", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        concurrency: 80,
        cpu: 1,
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        cpu: 0.5,
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });

    it("downgrades concurrency if necessary (implicit)", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        concurrency: 80,
        cpu: 1,
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        cpu: "gcf_gen1",
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });

    it("upgrades default concurrency with CPU upgrades", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        availableMemoryMb: 256,
        cpu: "gcf_gen1",
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });
  });

  describe("inferBlockingDetails", () => {
    it("should merge the blocking options and set default value", () => {
      const beforeCreate: backend.Endpoint = {
        ...ENDPOINT_BASE,
        id: "beforeCreate",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          options: {
            accessToken: true,
            refreshToken: false,
          },
        },
      };
      const beforeSignIn: backend.Endpoint = {
        ...ENDPOINT_BASE,
        id: "beforeSignIn",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          options: {
            accessToken: false,
            idToken: true,
          },
        },
      };

      prepare.inferBlockingDetails(backend.of(beforeCreate, beforeSignIn));

      expect(beforeCreate.blockingTrigger.options?.accessToken).to.be.true;
      expect(beforeCreate.blockingTrigger.options?.idToken).to.be.true;
      expect(beforeCreate.blockingTrigger.options?.refreshToken).to.be.false;
      expect(beforeSignIn.blockingTrigger.options?.accessToken).to.be.true;
      expect(beforeSignIn.blockingTrigger.options?.idToken).to.be.true;
      expect(beforeSignIn.blockingTrigger.options?.refreshToken).to.be.false;
    });
  });

  describe("updateEndpointTargetedStatus", () => {
    let endpoint1InBackend1: backend.Endpoint;
    let endpoint2InBackend1: backend.Endpoint;
    let endpoint1InBackend2: backend.Endpoint;
    let endpoint2InBackend2: backend.Endpoint;

    let backends: Record<string, backend.Backend>;

    beforeEach(() => {
      endpoint1InBackend1 = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint2InBackend1 = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint1InBackend2 = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv2",
        codebase: "backend2",
      };
      endpoint2InBackend2 = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv2",
        codebase: "backend2",
      };

      const backend1 = backend.of(endpoint1InBackend1, endpoint2InBackend1);
      const backend2 = backend.of(endpoint1InBackend2, endpoint2InBackend2);

      backends = { backend1, backend2 };
    });

    it("should mark targeted codebases", () => {
      const filters = [{ codebase: "backend1" }];
      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.true;
      expect(endpoint1InBackend2.targetedByOnly).to.be.false;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });

    it("should mark targeted codebases + ids", () => {
      const filters = [{ codebase: "backend1", idChunks: ["endpoint1"] }];

      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.false;
      expect(endpoint1InBackend2.targetedByOnly).to.be.false;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });

    it("should mark targeted ids", () => {
      const filters = [{ idChunks: ["endpoint1"] }];

      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.false;
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });
  });

  describe("warnIfNewGenkitFunctionIsMissingSecrets", () => {
    const nonGenkitEndpoint: backend.Endpoint = {
      id: "nonGenkit",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: latest("nodejs"),
      httpsTrigger: {},
    };

    const genkitEndpointWithSecrets: backend.Endpoint = {
      id: "genkitWithSecrets",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: latest("nodejs"),
      callableTrigger: {
        genkitAction: "action",
      },
      secretEnvironmentVariables: [
        {
          key: "SECRET",
          secret: "secret",
          projectId: "project",
        },
      ],
    };

    const genkitEndpointWithoutSecrets: backend.Endpoint = {
      id: "genkitWithoutSecrets",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: latest("nodejs"),
      callableTrigger: {
        genkitAction: "action",
      },
    };

    let confirm: sinon.SinonStub<
      Parameters<typeof prompt.confirm>,
      ReturnType<typeof prompt.confirm>
    >;

    beforeEach(() => {
      confirm = sinon.stub(prompt, "confirm");
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("should not prompt if there are no genkit functions", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(nonGenkitEndpoint),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if all genkit functions have secrets", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithSecrets),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if the function is already deployed", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.of(genkitEndpointWithoutSecrets),
        backend.of(genkitEndpointWithoutSecrets),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if force is true", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithoutSecrets),
        { force: true } as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should throw if missing secrets and noninteractive", async () => {
      confirm.resolves(false);
      await expect(
        prepare.warnIfNewGenkitFunctionIsMissingSecrets(
          backend.empty(),
          backend.of(genkitEndpointWithoutSecrets),
          { nonInteractive: true } as any,
        ),
      ).to.be.rejectedWith(FirebaseError);
      expect(confirm).to.have.been.calledWithMatch({ nonInteractive: true });
    });

    it("should prompt if missing secrets and interactive", async () => {
      confirm.resolves(true);
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithoutSecrets),
        {} as any,
      );
      expect(confirm).to.be.calledOnce;
    });

    it("should throw if user declines to deploy", async () => {
      confirm.resolves(false);
      await expect(
        prepare.warnIfNewGenkitFunctionIsMissingSecrets(
          backend.empty(),
          backend.of(genkitEndpointWithoutSecrets),
          {} as any,
        ),
      ).to.be.rejectedWith(FirebaseError);
    });
  });

  describe("ensureAllRequiredAPIsEnabled", () => {
    let sinonSandbox: sinon.SinonSandbox;
    let ensureApiStub: sinon.SinonStub;
    let generateServiceIdentityStub: sinon.SinonStub;

    beforeEach(() => {
      sinonSandbox = sinon.createSandbox();
      ensureApiStub = sinonSandbox.stub(ensureApiEnabled, "ensure").resolves();
      generateServiceIdentityStub = sinonSandbox
        .stub(serviceusage, "generateServiceIdentity")
        .resolves();
    });

    afterEach(() => {
      sinonSandbox.restore();
    });

    it("should not enable any APIs for an empty backend", async () => {
      await prepare.ensureAllRequiredAPIsEnabled("project", backend.empty());
      expect(ensureApiStub.called).to.be.false;
      expect(generateServiceIdentityStub.called).to.be.false;
    });

    it("should enable APIs from backend.requiredAPIs", async () => {
      const api1 = "testapi1.googleapis.com";
      const api2 = "testapi2.googleapis.com";
      const b = backend.empty();
      b.requiredAPIs = [{ api: api1 }, { api: api2 }];

      await prepare.ensureAllRequiredAPIsEnabled("project", b);
      expect(ensureApiStub.calledWith("project", api1, "functions", false)).to.be.true;
      expect(ensureApiStub.calledWith("project", api2, "functions", false)).to.be.true;
    });

    it("should enable Secret Manager API if secrets are used ", async () => {
      const e: backend.Endpoint = {
        id: "hasSecrets",
        platform: "gcfv1",
        region: "us-central1",
        project: "project",
        entryPoint: "entry",
        runtime: latest("nodejs"),
        httpsTrigger: {},
        secretEnvironmentVariables: [
          {
            key: "SECRET",
            secret: "secret",
            projectId: "project",
          },
        ],
      };
      await prepare.ensureAllRequiredAPIsEnabled("project", backend.of(e));
      expect(
        ensureApiStub.calledWith(
          "project",
          "https://secretmanager.googleapis.com",
          "functions",
          false,
        ),
      ).to.be.true;
    });

    it("should enable GCFv2 APIs and generate required service identities", async () => {
      const e: backend.Endpoint = {
        id: "v2",
        platform: "gcfv2",
        region: "us-central1",
        project: "project",
        entryPoint: "entry",
        runtime: latest("nodejs"),
        httpsTrigger: {},
      };

      await prepare.ensureAllRequiredAPIsEnabled("project", backend.of(e));

      expect(ensureApiStub.calledWith("project", "https://run.googleapis.com", "functions")).to.be
        .true;
      expect(ensureApiStub.calledWith("project", "https://eventarc.googleapis.com", "functions")).to
        .be.true;
      expect(ensureApiStub.calledWith("project", "https://pubsub.googleapis.com", "functions")).to
        .be.true;
      expect(ensureApiStub.calledWith("project", "https://storage.googleapis.com", "functions")).to
        .be.true;
      expect(
        generateServiceIdentityStub.calledWith("project", "pubsub.googleapis.com", "functions"),
      ).to.be.true;
      expect(
        generateServiceIdentityStub.calledWith("project", "eventarc.googleapis.com", "functions"),
      ).to.be.true;
    });
  });
});
