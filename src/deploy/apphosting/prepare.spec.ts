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
import prepare, { getBackendConfigs } from "./prepare";
import * as localbuilds from "../../apphosting/localbuilds";
import * as managementApps from "../../management/apps";

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
        env: [],
      });
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

      expect(doSetupSourceDeployStub).to.be.calledWith("my-project", "foo");
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
  });
});
