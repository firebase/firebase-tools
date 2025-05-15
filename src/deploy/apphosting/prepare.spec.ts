import { expect } from "chai";
import * as sinon from "sinon";
import * as backend from "../../apphosting/backend";
import { Config } from "../../config";
import * as apiEnabled from "../../ensureApiEnabled";
import { AppHostingSingle } from "../../firebaseConfig";
import * as apphosting from "../../gcp/apphosting";
import * as devconnect from "../../gcp/devConnect";
import * as prompt from "../../prompt";
import { RC } from "../../rc";
import { Context } from "./args";
import prepare, { getBackendConfigs } from "./prepare";

const BASE_OPTS = {
  cwd: "/",
  configPath: "/",
  except: "",
  force: false,
  nonInteractive: false,
  interactive: false,
  debug: false,
  filteredTargets: [],
  rc: new RC(),
  json: false,
};

function initializeContext(): Context {
  return {
    backendConfigs: new Map<string, AppHostingSingle>(),
    backendLocations: new Map<string, string>(),
    backendStorageUris: new Map<string, string>(),
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

      expect(context.backendLocations.get("foo")).to.equal("us-central1");
      expect(context.backendConfigs.get("foo")).to.deep.equal({
        backendId: "foo",
        rootDir: "/",
        ignore: [],
      });
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
      expect(context.backendLocations.get("foo")).to.equal("us-central1");
      expect(context.backendConfigs.get("foo")).to.deep.equal({
        backendId: "foo",
        rootDir: "/",
        ignore: [],
      });
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

      expect(context.backendLocations.get("foo")).to.equal(undefined);
      expect(context.backendConfigs.get("foo")).to.deep.equal(undefined);
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

      expect(context.backendLocations.get("foo")).to.equal("us-central1");
      expect(context.backendConfigs.get("foo")).to.deep.equal({
        backendId: "foo",
        rootDir: "/",
        ignore: [],
        alwaysDeployFromSource: true,
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
  });
});
