import { expect } from "chai";
import * as sinon from "sinon";
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

      const annotations = {
        adapterPackageName: "@apphosting/angular-adapter",
        adapterVersion: "14.1",
        framework: "nextjs",
      };
      const buildConfig = {
        runCommand: "npm run build:prod",
        env: [],
      };
      sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: ["./next/standalone"],
        buildConfig,
        annotations,
      });
      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
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
        buildDir: "./next/standalone",
        buildConfig,
        annotations,
      });
      expect(addServiceAccountToRolesStub).to.have.been.calledWith(
        "my-project",
        apphosting.serviceAgentEmail("123456789"),
        ["roles/storage.objectViewer"],
        true,
      );
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
        annotations: {},
      });

      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
            appId: "my-app-id",
          },
        ],
      });

      await prepare(context, optsWithLocalBuild);

      expect(localBuildStub).to.be.calledWithMatch(
        "my-project",
        sinon.match.any,
        "nextjs",
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
        annotations: {},
      });

      listBackendsStub.onFirstCall().resolves({
        backends: [
          {
            name: "projects/my-project/locations/us-central1/backends/foo",
          },
        ],
      });

      await prepare(context, optsWithLocalBuild);

      expect(localBuildStub).to.have.been.calledWithMatch(
        "my-project",
        sinon.match.any,
        "nextjs",
        sinon.match({
          BUILD_VAR: { secret: "build-secret", availability: ["BUILD"] },
          SHARED_VAR: { secret: "shared-secret", availability: ["BUILD", "RUNTIME"] },
        }),
      );
      // RUNTIME_VAR should definitely NOT be present in match
      expect(localBuildStub.firstCall.args[3]).to.not.have.property("RUNTIME_VAR");
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
});
