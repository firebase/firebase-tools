import { expect } from "chai";
import * as sinon from "sinon";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as backend from "../../apphosting/backend";
import { Config } from "../../config";
import * as apiEnabled from "../../ensureApiEnabled";
import * as apphosting from "../../gcp/apphosting";
import * as devconnect from "../../gcp/devConnect";
import * as prompt from "../../prompt";
import { RC } from "../../rc";
import { Context } from "./args";
import { FirebaseError } from "../../error";
import prepare, {
  getBackendConfigs,
  injectEnvVarsFromApphostingConfig,
  injectAutoInitEnvVars,
  injectAngularEnvVars,
} from "./prepare";
import * as localbuilds from "../../apphosting/localbuilds";
import * as managementApps from "../../management/apps";
import * as experiments from "../../experiments";
import * as getProjectNumber from "../../getProjectNumber";
import * as resourceManager from "../../gcp/resourceManager";
import * as apphostingConfig from "../../apphosting/config";
import * as apphostingUtils from "../../apphosting/utils";
import { AppHostingYamlConfig, EnvMap } from "../../apphosting/yaml";
import { Options } from "../../options";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fs from "fs";
import * as fsAsync from "../../fsAsync";
import * as utils from "../../utils";

const BASE_OPTS = {
  cwd: "/",
  configPath: "/",
  except: "",
  force: false,
  nonInteractive: false,
  debug: false,
  filteredTargets: [],
  rc: new RC(),
};

function initializeContext(): Context {
  return {
    backendConfigs: {},
    backendLocations: {},
    backendStorageUris: {},
    backendLocalBuilds: {},
  };
}

describe("apphosting", () => {
  const expectedPathHash = crypto
    .createHash("md5")
    .update(process.cwd())
    .digest("hex")
    .substring(0, 8);

  const opts = {
    ...BASE_OPTS,
    projectId: "my-project",
    only: "apphosting",
    config: new Config({
      apphosting: {
        backendId: "foo",
        rootDir: "/",
        ignore: [],
      },
    }),
  };

  let confirmStub: sinon.SinonStub;
  let checkboxStub: sinon.SinonStub;
  let doSetupSourceDeployStub: sinon.SinonStub;
  let listBackendsStub: sinon.SinonStub;
  let getGitRepositoryLinkStub: sinon.SinonStub;
  let assertEnabledStub: sinon.SinonStub;
  let addServiceAccountToRolesStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(opts.config, "writeProjectFile").returns();
    confirmStub = sinon.stub(prompt, "confirm").throws("Unexpected confirm call");
    checkboxStub = sinon.stub(prompt, "checkbox").throws("Unexpected checkbox scall");
    doSetupSourceDeployStub = sinon
      .stub(backend, "doSetupSourceDeploy")
      .throws("Unexpected doSetupSourceDeploy call");
    listBackendsStub = sinon
      .stub(apphosting, "listBackends")
      .throws("Unexpected listBackends call");
    sinon.stub(backend, "ensureAppHostingComputeServiceAccount").resolves();
    sinon.stub(apiEnabled, "ensure").resolves();
    getGitRepositoryLinkStub = sinon
      .stub(devconnect, "getGitRepositoryLink")
      .throws("Unexpected getGitRepositoryLink call");
    assertEnabledStub = sinon.stub(experiments, "assertEnabled").returns();
    sinon.stub(experiments, "isEnabled").returns(true);
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("123456789");
    addServiceAccountToRolesStub = sinon
      .stub(resourceManager, "addServiceAccountToRoles")
      .resolves();

    sinon.stub(os, "tmpdir").returns("/tmp");
    sinon.stub(fs, "existsSync").returns(false);
    sinon.stub(fs, "mkdirSync").returns(undefined);
    sinon.stub(fs, "rmSync").returns(undefined);
    sinon.stub(fs, "copyFileSync").returns(undefined);
    sinon.stub(fsAsync, "readdirRecursive").resolves([]);
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("prepare", () => {
    it("correctly creates configs for localBuild backends", async () => {
      const optsWithLocalBuild = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        }),
      };
      const context = initializeContext();

      const buildConfig = {
        runCommand: "npm run build:prod",
        env: [],
      };
      sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: ["./next/standalone"],
        buildConfig,
      });
      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
            runtime: { value: "nodejs22" },
          },
        ],
      });

      await prepare(context, optsWithLocalBuild);

      expect(context.backendLocations["foo"]).to.equal("us-central1");
      expect(context.backendConfigs["foo"]).to.deep.equal({
        backendId: "foo",
        rootDir: "/",
        ignore: [],
        localBuild: true,
      });
      expect(context.backendLocalBuilds["foo"]).to.deep.equal({
        outputFiles: ["./next/standalone"],
        localBuildScratchDir: path.join(
          os.tmpdir(),
          `apphosting-local-build-foo-${expectedPathHash}`,
        ),
        buildConfig,
      });
      expect(addServiceAccountToRolesStub).to.have.been.calledWith(
        "my-project",
        apphosting.serviceAgentEmail("123456789"),
        ["roles/storage.objectViewer"],
        true,
      );
    });

    it("supports multiple parallel local builds without directory clobbering", async () => {
      const optsWithMultipleLocalBuilds = {
        ...opts,
        config: new Config({
          apphosting: [
            {
              backendId: "backend-prod",
              rootDir: "/",
              ignore: [],
              localBuild: true,
            },
            {
              backendId: "backend-staging",
              rootDir: "/",
              ignore: [],
              localBuild: true,
            },
          ],
        }),
      };
      const context = initializeContext();
      context.backendConfigs = {
        "backend-prod": {
          backendId: "backend-prod",
          rootDir: "/",
          ignore: [],
          localBuild: true,
        },
        "backend-staging": {
          backendId: "backend-staging",
          rootDir: "/",
          ignore: [],
          localBuild: true,
        },
      };
      context.backendLocations = {
        "backend-prod": "us-central1",
        "backend-staging": "us-central1",
      };

      const localBuildStub = sinon.stub(localbuilds, "localBuild");
      localBuildStub
        .withArgs(
          sinon.match.any,
          sinon.match(
            (p: string) =>
              p ===
              path.join(os.tmpdir(), `apphosting-local-build-backend-prod-${expectedPathHash}`),
          ),
          sinon.match.any,
        )
        .resolves({
          outputFiles: ["./next/standalone-prod"],
          buildConfig: { runCommand: "npm run build:prod", env: [] },
        });
      localBuildStub
        .withArgs(
          sinon.match.any,
          sinon.match(
            (p: string) =>
              p ===
              path.join(os.tmpdir(), `apphosting-local-build-backend-staging-${expectedPathHash}`),
          ),
          sinon.match.any,
        )
        .resolves({
          outputFiles: ["./next/standalone-staging"],
          buildConfig: { runCommand: "npm run build:staging", env: [] },
        });

      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/backend-prod",
            runtime: { value: "nodejs22" },
          },
          {
            name: "projects/my-project/locations/us-central1/backends/backend-staging",
            runtime: { value: "nodejs22" },
          },
        ],
      });

      await prepare(context, optsWithMultipleLocalBuilds);

      expect(context.backendLocalBuilds["backend-prod"].localBuildScratchDir).to.equal(
        path.join(os.tmpdir(), `apphosting-local-build-backend-prod-${expectedPathHash}`),
      );
      expect(context.backendLocalBuilds["backend-staging"].localBuildScratchDir).to.equal(
        path.join(os.tmpdir(), `apphosting-local-build-backend-staging-${expectedPathHash}`),
      );

      expect(context.backendLocalBuilds["backend-prod"].outputFiles).to.deep.equal([
        "./next/standalone-prod",
      ]);
      expect(context.backendLocalBuilds["backend-staging"].outputFiles).to.deep.equal([
        "./next/standalone-staging",
      ]);
    });

    it("injects Firebase configuration when appId is present", async () => {
      const optsWithLocalBuild = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        }),
      };
      const context = initializeContext();

      const webAppConfig = {
        projectId: "my-project",
        appId: "my-app-id",
        apiKey: "my-api-key",
        authDomain: "my-project.firebaseapp.com",
        databaseURL: "https://my-project.firebaseio.com",
        storageBucket: "my-project.appspot.com",
        messagingSenderId: "123456",
        measurementId: "G-123456",
      };

      sinon.stub(managementApps, "getAppConfig").resolves(webAppConfig);
      const localBuildStub = sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: ["./next/standalone"],
        buildConfig: { runCommand: "npm run build", env: [] },
      });

      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
            appId: "my-app-id",
            runtime: { value: "nodejs22" },
          },
        ],
      });

      await prepare(context, optsWithLocalBuild);

      expect(localBuildStub).to.be.calledWithMatch(
        "my-project",
        sinon.match.any,
        sinon.match({
          FIREBASE_WEBAPP_CONFIG: { value: JSON.stringify(webAppConfig) },
          FIREBASE_CONFIG: {
            value: JSON.stringify({
              databaseURL: webAppConfig.databaseURL,
              storageBucket: webAppConfig.storageBucket,
              projectId: webAppConfig.projectId,
            }),
          },
        }),
      );
      expect(addServiceAccountToRolesStub).to.have.been.calledWith(
        "my-project",
        apphosting.serviceAgentEmail("123456789"),
        ["roles/storage.objectViewer"],
        true,
      );
    });

    it("does not attempt to resolve RUNTIME-only secrets, but passes BUILD-available secrets", async () => {
      const optsWithLocalBuild = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        }),
      };
      const context = initializeContext();

      const yamlConfig = AppHostingYamlConfig.empty();
      yamlConfig.env = {
        BUILD_VAR: { secret: "build-secret", availability: ["BUILD"] },
        RUNTIME_VAR: { secret: "runtime-secret", availability: ["RUNTIME"] },
        SHARED_VAR: { secret: "shared-secret", availability: ["BUILD", "RUNTIME"] },
      };
      sinon.stub(apphostingConfig, "getAppHostingConfiguration").resolves(yamlConfig);

      const localBuildStub = sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: ["./next/standalone"],
        buildConfig: { runCommand: "npm run build", env: [] },
      });

      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
            runtime: { value: "nodejs22" },
          },
        ],
      });

      await prepare(context, optsWithLocalBuild);

      expect(localBuildStub).to.have.been.calledWithMatch(
        "my-project",
        sinon.match.any,
        sinon.match({
          BUILD_VAR: { secret: "build-secret", availability: ["BUILD"] },
          SHARED_VAR: { secret: "shared-secret", availability: ["BUILD", "RUNTIME"] },
        }),
      );
      // RUNTIME_VAR should definitely NOT be present in match
      expect(localBuildStub.firstCall.args[2]).to.not.have.property("RUNTIME_VAR");
    });

    it("should fail if localBuild is specified but experiment is disabled", async () => {
      const optsWithLocalBuild = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        }),
      };
      const context = initializeContext();

      assertEnabledStub.throws(new Error("Experiment 'apphostinglocalbuilds' is not enabled."));
      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
          },
        ],
      });

      try {
        await prepare(context, optsWithLocalBuild);
        expect.fail("Should have thrown an error");
      } catch (e: unknown) {
        if (e instanceof Error) {
          expect(e.message).to.include("Experiment 'apphostinglocalbuilds' is not enabled.");
        } else {
          expect.fail("Expected Error instance");
        }
      }
    });

    it("should succeed and configure multiple output files/directories if localBuild produces them", async () => {
      const optsWithLocalBuild = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        }),
      };
      const context = initializeContext();

      sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: ["./next/standalone", "./another/path"],
        buildConfig: { runCommand: "npm run start" },
      });
      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
            runtime: { value: "nodejs22" },
          },
        ],
      });

      await prepare(context, optsWithLocalBuild);

      expect(context.backendLocalBuilds["foo"].outputFiles).to.deep.equal([
        "./next/standalone",
        "./another/path",
      ]);
    });

    it("should succeed with outputFiles as [] if localBuild produces 0 output files/directories (e.g. Angular)", async () => {
      const optsWithLocalBuild = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        }),
      };
      const context = initializeContext();

      sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: [],
        buildConfig: { runCommand: "npm run start" },
      });
      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
            runtime: { value: "nodejs22" },
          },
        ],
      });

      await prepare(context, optsWithLocalBuild);

      expect(context.backendLocalBuilds["foo"].outputFiles).to.deep.equal([]);
    });

    it("links to existing backend if it already exists", async () => {
      const context = initializeContext();
      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
          },
        ],
      });

      await prepare(context, opts);

      expect(context.backendLocations["foo"]).to.equal("us-central1");
      expect(context.backendConfigs["foo"]).to.deep.equal({
        backendId: "foo",
        rootDir: "/",
        ignore: [],
      });
      expect(context.backendLocalBuilds["foo"]).to.be.undefined;
    });

    it("creates a backend if it doesn't exist yet", async () => {
      const context = initializeContext();
      listBackendsStub.onFirstCall().resolves({
        backends: [],
      });
      doSetupSourceDeployStub.resolves({ location: "us-central1" });
      confirmStub.resolves(true);
      checkboxStub.resolves(["foo"]);

      await prepare(context, opts);

      expect(doSetupSourceDeployStub).to.be.calledWith("my-project", "foo", false, "/");
      expect(context.backendLocations["foo"]).to.equal("us-central1");
      expect(context.backendConfigs["foo"]).to.deep.equal({
        backendId: "foo",
        rootDir: "/",
        ignore: [],
      });
      expect(context.backendLocalBuilds["foo"]).to.be.undefined;
    });

    it("skips backend deployment if alwaysDeployFromSource is false", async () => {
      const optsWithAlwaysDeploy = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            alwaysDeployFromSource: false,
          },
        }),
      };
      const context = initializeContext();
      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
            codebase: {
              repository: "remote-repo.git",
            },
          },
        ],
      });

      await prepare(context, optsWithAlwaysDeploy);

      expect(context.backendLocations["foo"]).to.be.undefined;
      expect(context.backendConfigs["foo"]).to.be.undefined;
      expect(context.backendLocalBuilds["foo"]).to.be.undefined;
    });

    it("prompts user if codebase is already connected and alwaysDeployFromSource is undefined", async () => {
      const context = initializeContext();
      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
            codebase: {
              repository:
                "projects/my-project/locations/us-central1/connections/my-connection/gitRepositoryLinks/foo",
            },
          },
        ],
      });
      getGitRepositoryLinkStub.onFirstCall().resolves({
        cloneUri: "github.com/my-org/foo.git",
      });
      confirmStub.onFirstCall().resolves(true);

      await prepare(context, opts);

      expect(context.backendLocations["foo"]).to.equal("us-central1");
      expect(context.backendConfigs["foo"]).to.deep.equal({
        backendId: "foo",
        rootDir: "/",
        ignore: [],
        alwaysDeployFromSource: true,
      });
      expect(context.backendLocalBuilds["foo"]).to.undefined;
    });

    it("throws an error for localBuild when experiment is not enabled", async () => {
      const optsWithLocalBuild = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        }),
      };

      (experiments.isEnabled as sinon.SinonStub).withArgs("apphostinglocalbuilds").returns(false);
      assertEnabledStub.throws(
        new FirebaseError(
          "Cannot perform a local build because the experiment apphostinglocalbuilds is not enabled.",
        ),
      );

      const context = initializeContext();
      listBackendsStub.resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
          },
        ],
      });

      await expect(prepare(context, optsWithLocalBuild)).to.be.rejectedWith(
        FirebaseError,
        "Cannot perform a local build",
      );
      expect(addServiceAccountToRolesStub).to.not.have.been.called;
    });

    it("should succeed for source deploys even if experiment is disabled", async () => {
      const context = initializeContext();
      listBackendsStub.resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
          },
        ],
      });

      // No localBuild: true in config
      (experiments.isEnabled as sinon.SinonStub).withArgs("apphostinglocalbuilds").returns(false);
      await prepare(context, opts);

      expect(assertEnabledStub).to.not.have.been.calledWith("apphostinglocalbuilds");
    });

    it("dynamically fetches the backend from the API if it is not found in the pre-fetched list (e.g., newly created)", async () => {
      const optsWithLocalBuild = {
        ...opts,
        config: new Config({
          apphosting: {
            backendId: "newly-created-backend",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        }),
      };
      const context = initializeContext();

      const buildConfig = {
        runCommand: "npm run build:prod",
        env: [],
      };
      sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: ["./next/standalone"],
        buildConfig,
      });

      listBackendsStub.onFirstCall().resolves({
        backends: [],
      });

      doSetupSourceDeployStub.resolves({ location: "us-central1" });
      confirmStub.resolves(true);
      checkboxStub.resolves(["newly-created-backend"]);

      const getBackendStub = sinon.stub(apphosting, "getBackend").resolves({
        name: "projects/my-project/locations/us-central1/backends/newly-created-backend",
        runtime: { value: "nodejs22" },
      } as any);

      await prepare(context, optsWithLocalBuild);

      expect(getBackendStub).to.have.been.calledOnceWith(
        "my-project",
        "us-central1",
        "newly-created-backend",
      );
      expect(context.backendLocalBuilds["newly-created-backend"]).to.deep.equal({
        outputFiles: ["./next/standalone"],
        localBuildScratchDir: path.join(
          os.tmpdir(),
          `apphosting-local-build-newly-created-backend-${expectedPathHash}`,
        ),
        buildConfig,
      });
    });
  });

  describe("getBackendConfigs", () => {
    const apphostingConfig = [
      {
        backendId: "foo",
        rootDir: "/",
        ignore: [],
      },
      {
        backendId: "bar",
        rootDir: "/",
        ignore: [],
      },
    ];

    it("selects all backends when no --only is passed", () => {
      const configs = getBackendConfigs({
        ...BASE_OPTS,
        only: "",
        config: new Config({
          apphosting: apphostingConfig,
        }),
      });

      expect(configs).to.deep.equal(apphostingConfig);
    });

    it("selects all backends when --apphosting is passed", () => {
      const configs = getBackendConfigs({
        ...BASE_OPTS,
        only: "apphosting",
        config: new Config({
          apphosting: apphostingConfig,
        }),
      });

      expect(configs).to.deep.equal(apphostingConfig);
    });

    it("selects App Hosting backends when multiple product filters are passed", () => {
      const configs = getBackendConfigs({
        ...BASE_OPTS,
        only: "functions,apphosting",
        config: new Config({
          functions: {},
          hosting: {},
          apphosting: apphostingConfig,
        }),
      });

      expect(configs).to.deep.equal(apphostingConfig);
    });

    it("selects a specific App Hosting backend", () => {
      const configs = getBackendConfigs({
        ...BASE_OPTS,
        only: "apphosting:foo",
        config: new Config({
          apphosting: apphostingConfig,
        }),
      });

      expect(configs).to.deep.equal([
        {
          backendId: "foo",
          rootDir: "/",
          ignore: [],
        },
      ]);
    });

    it("throws error when no backend ID in firebase.json matches the one provided in --only flag", () => {
      expect(() =>
        getBackendConfigs({
          ...BASE_OPTS,
          only: "apphosting:baz",
          config: new Config({
            apphosting: apphostingConfig,
          }),
        }),
      ).to.throw("App Hosting backend IDs baz not detected in firebase.json");
    });
  });

  describe("injectEnvVarsFromApphostingConfig", () => {
    let getAppHostingConfigurationStub: sinon.SinonStub;

    beforeEach(() => {
      getAppHostingConfigurationStub = sinon.stub(apphostingConfig, "getAppHostingConfiguration");
    });

    it("merges multiple configs for the same backend, preferring the last one", async () => {
      const configs = [
        { backendId: "foo", rootDir: "/dir1", ignore: [] },
        { backendId: "foo", rootDir: "/dir2", ignore: [] },
      ];

      const yamlConfig1 = AppHostingYamlConfig.empty();
      yamlConfig1.env = {
        VAR1: { value: "val1" },
        VAR2: { value: "original" },
      };

      const yamlConfig2 = AppHostingYamlConfig.empty();
      yamlConfig2.env = {
        VAR2: { value: "override" },
        VAR3: { value: "val3" },
      };

      getAppHostingConfigurationStub.withArgs(sinon.match("/dir1")).resolves(yamlConfig1);
      getAppHostingConfigurationStub.withArgs(sinon.match("/dir2")).resolves(yamlConfig2);

      const buildEnv: Record<string, EnvMap> = {};
      const runtimeEnv: Record<string, EnvMap> = {};

      await injectEnvVarsFromApphostingConfig(
        configs as unknown as AppHostingSingle[],
        opts as unknown as Options,
        buildEnv,
        runtimeEnv,
      );

      // Verify the final map has all three variables, and VAR2 was successfully overridden by dir2
      expect(buildEnv["foo"]).to.deep.equal({
        VAR1: { value: "val1" },
        VAR2: { value: "override" },
        VAR3: { value: "val3" },
      });
      expect(runtimeEnv["foo"]).to.deep.equal({
        VAR1: { value: "val1" },
        VAR2: { value: "override" },
        VAR3: { value: "val3" },
      });
    });
  });

  describe("injectAutoInitEnvVars", () => {
    beforeEach(() => {
      sinon.stub(managementApps, "getAppConfig").resolves({
        appId: "my-app-id",
        projectId: "my-project",
      } as unknown as Awaited<ReturnType<typeof managementApps.getAppConfig>>);
      sinon.stub(apphostingUtils, "getAutoinitEnvVars").returns({
        AUTO_VAR_1: "auto1",
        USER_VAR_1: "auto_override",
      });
    });

    it("injects auto-init variables but respects existing explicitly defined variables", async () => {
      const cfg = { backendId: "foo", rootDir: "/", ignore: [] };
      const backends = [
        {
          name: "projects/my-project/locations/us-central1/backends/foo",
          appId: "my-app-id",
        } as unknown as apphosting.Backend,
      ];

      // Build and runtime envs inherently start with USER_VAR_1 already set
      const buildEnv: Record<string, EnvMap> = {
        foo: {
          USER_VAR_1: { value: "user_defined_value" },
        },
      };

      const runtimeEnv: Record<string, EnvMap> = {
        foo: {
          USER_VAR_1: { value: "user_defined_value" },
        },
      };

      await injectAutoInitEnvVars(cfg, backends, buildEnv, runtimeEnv);

      // It should NOT overwrite USER_VAR_1, but it SHOULD add AUTO_VAR_1
      expect(buildEnv["foo"]["USER_VAR_1"]?.value).to.equal("user_defined_value");
      expect(buildEnv["foo"]["AUTO_VAR_1"]?.value).to.equal("auto1");

      expect(runtimeEnv["foo"]["USER_VAR_1"]?.value).to.equal("user_defined_value");
      expect(runtimeEnv["foo"]["AUTO_VAR_1"]?.value).to.equal("auto1");
    });
  });

  describe("injectAngularEnvVars", () => {
    let existsStub: sinon.SinonStub;
    let readFileSyncStub: sinon.SinonStub;

    beforeEach(() => {
      existsStub = fs.existsSync as sinon.SinonStub;
      readFileSyncStub = sinon.stub(fs, "readFileSync");
    });

    it("should do nothing for non-Angular applications", async () => {
      const cfg: AppHostingSingle = { backendId: "foo", rootDir: "/", ignore: [] };
      const buildEnv: Record<string, EnvMap> = { foo: {} };
      const runtimeEnv: Record<string, EnvMap> = { foo: {} };

      existsStub.returns(false);

      await injectAngularEnvVars(
        cfg,
        "/app-dir",
        "my-project",
        "us-central1",
        buildEnv,
        runtimeEnv,
      );

      expect(buildEnv["foo"]).to.be.empty;
      expect(runtimeEnv["foo"]).to.be.empty;
    });

    it("should inject defaults for Angular applications when headers are missing", async () => {
      const cfg: AppHostingSingle = { backendId: "foo", rootDir: "/", ignore: [] };
      const buildEnv: Record<string, EnvMap> = { foo: {} };
      const runtimeEnv: Record<string, EnvMap> = { foo: {} };

      existsStub.withArgs(sinon.match("package.json")).returns(true);
      readFileSyncStub.withArgs(sinon.match("package.json")).returns(
        JSON.stringify({
          dependencies: {
            "@angular/core": "^19.0.0",
          },
        }),
      );

      await injectAngularEnvVars(
        cfg,
        "/app-dir",
        "my-project",
        "us-central1",
        buildEnv,
        runtimeEnv,
      );

      expect(runtimeEnv["foo"]["NG_TRUST_PROXY_HEADERS"]).to.deep.equal({
        value: "x-forwarded-host,x-forwarded-port,x-forwarded-proto,x-forwarded-for",
        availability: ["RUNTIME"],
      });
      expect(runtimeEnv["foo"]["NG_ALLOWED_HOSTS"]).to.deep.equal({
        value:
          "foo-123456789.us-central1.run.app,foo--my-project.us-central1.hosted.app,foo--my-project.web.app,foo--my-project.firebaseapp.com",
        availability: ["RUNTIME"],
      });
    });

    it("should NOT override user-defined NG_TRUST_PROXY_HEADERS if it is a subset of allowed values", async () => {
      const cfg: AppHostingSingle = { backendId: "foo", rootDir: "/", ignore: [] };
      const buildEnv: Record<string, EnvMap> = { foo: {} };
      const runtimeEnv: Record<string, EnvMap> = {
        foo: {
          NG_TRUST_PROXY_HEADERS: {
            value: "x-forwarded-host,x-forwarded-proto",
            availability: ["RUNTIME"],
          },
        },
      };

      existsStub.withArgs(sinon.match("package.json")).returns(true);
      readFileSyncStub.returns(
        JSON.stringify({
          dependencies: { "@angular/core": "^19.0.0" },
        }),
      );

      const warningSpy = sinon.spy(utils, "logLabeledWarning");

      await injectAngularEnvVars(
        cfg,
        "/app-dir",
        "my-project",
        "us-central1",
        buildEnv,
        runtimeEnv,
      );

      expect(runtimeEnv["foo"]["NG_TRUST_PROXY_HEADERS"]).to.deep.equal({
        value: "x-forwarded-host,x-forwarded-proto",
        availability: ["RUNTIME"],
      });
      expect(warningSpy).to.not.have.been.called;
    });

    it("should throw a FirebaseError if user-defined NG_TRUST_PROXY_HEADERS contains invalid headers", async () => {
      const cfg: AppHostingSingle = { backendId: "foo", rootDir: "/", ignore: [] };
      const buildEnv: Record<string, EnvMap> = { foo: {} };
      const runtimeEnv: Record<string, EnvMap> = {
        foo: {
          NG_TRUST_PROXY_HEADERS: {
            value: "x-forwarded-host,invalid-header",
            availability: ["RUNTIME"],
          },
        },
      };

      existsStub.withArgs(sinon.match("package.json")).returns(true);
      readFileSyncStub.returns(
        JSON.stringify({
          dependencies: { "@angular/core": "^19.0.0" },
        }),
      );

      await expect(
        injectAngularEnvVars(cfg, "/app-dir", "my-project", "us-central1", buildEnv, runtimeEnv),
      ).to.be.rejectedWith(
        FirebaseError,
        /User-defined RUNTIME environment variable NG_TRUST_PROXY_HEADERS contains invalid headers/,
      );
    });

    it("should override user-defined NG_TRUST_PROXY_HEADERS but NOT log a warning if defined as BUILD-only variable", async () => {
      const cfg: AppHostingSingle = { backendId: "foo", rootDir: "/", ignore: [] };
      const buildEnv: Record<string, EnvMap> = {
        foo: {
          NG_TRUST_PROXY_HEADERS: {
            value: "x-forwarded-host,x-forwarded-proto",
            availability: ["BUILD"],
          },
        },
      };
      const runtimeEnv: Record<string, EnvMap> = { foo: {} };

      existsStub.withArgs(sinon.match("package.json")).returns(true);
      readFileSyncStub.returns(
        JSON.stringify({
          dependencies: { "@angular/core": "^19.0.0" },
        }),
      );

      const warningSpy = sinon.spy(utils, "logLabeledWarning");

      await injectAngularEnvVars(
        cfg,
        "/app-dir",
        "my-project",
        "us-central1",
        buildEnv,
        runtimeEnv,
      );

      expect(runtimeEnv["foo"]["NG_TRUST_PROXY_HEADERS"]).to.deep.equal({
        value: "x-forwarded-host,x-forwarded-port,x-forwarded-proto,x-forwarded-for",
        availability: ["RUNTIME"],
      });
      expect(buildEnv["foo"]["NG_TRUST_PROXY_HEADERS"]).to.deep.equal({
        value: "x-forwarded-host,x-forwarded-proto",
        availability: ["BUILD"],
      });
      expect(warningSpy).to.not.have.been.called;
    });

    it("should NOT inject default NG_ALLOWED_HOSTS if user has defined it as RUNTIME variable", async () => {
      const cfg: AppHostingSingle = { backendId: "foo", rootDir: "/", ignore: [] };
      const buildEnv: Record<string, EnvMap> = { foo: {} };
      const runtimeEnv: Record<string, EnvMap> = {
        foo: {
          NG_ALLOWED_HOSTS: {
            value: "MY-CUSTOM-DOMAIN.COM",
            availability: ["RUNTIME"],
          },
        },
      };

      existsStub.withArgs(sinon.match("package.json")).returns(true);
      readFileSyncStub.returns(
        JSON.stringify({
          dependencies: { "@angular/core": "^19.0.0" },
        }),
      );

      await injectAngularEnvVars(
        cfg,
        "/app-dir",
        "my-project",
        "us-central1",
        buildEnv,
        runtimeEnv,
      );

      expect(runtimeEnv["foo"]["NG_ALLOWED_HOSTS"]).to.deep.equal({
        value: "MY-CUSTOM-DOMAIN.COM",
        availability: ["RUNTIME"],
      });
      expect(buildEnv["foo"]["NG_ALLOWED_HOSTS"]).to.be.undefined;
    });

    it("should inject default NG_ALLOWED_HOSTS into runtimeEnv if user defined it as a BUILD-only variable", async () => {
      const cfg: AppHostingSingle = { backendId: "foo", rootDir: "/", ignore: [] };
      const buildEnv: Record<string, EnvMap> = {
        foo: {
          NG_ALLOWED_HOSTS: {
            value: "MY-CUSTOM-DOMAIN.COM,foo-123456789.us-central1.run.app,Another-Domain.com",
            availability: ["BUILD"],
          },
        },
      };
      const runtimeEnv: Record<string, EnvMap> = { foo: {} };

      existsStub.withArgs(sinon.match("package.json")).returns(true);
      readFileSyncStub.returns(
        JSON.stringify({
          dependencies: { "@angular/core": "^19.0.0" },
        }),
      );

      await injectAngularEnvVars(
        cfg,
        "/app-dir",
        "my-project",
        "us-central1",
        buildEnv,
        runtimeEnv,
      );

      expect(runtimeEnv["foo"]["NG_ALLOWED_HOSTS"]).to.deep.equal({
        value:
          "foo-123456789.us-central1.run.app,foo--my-project.us-central1.hosted.app,foo--my-project.web.app,foo--my-project.firebaseapp.com",
        availability: ["RUNTIME"],
      });
      expect(buildEnv["foo"]["NG_ALLOWED_HOSTS"]).to.deep.equal({
        value: "MY-CUSTOM-DOMAIN.COM,foo-123456789.us-central1.run.app,Another-Domain.com",
        availability: ["BUILD"],
      });
    });
  });
});
