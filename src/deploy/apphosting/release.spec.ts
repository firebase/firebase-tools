import * as sinon from "sinon";
import * as rollout from "../../apphosting/rollout";
import * as backend from "../../apphosting/backend";
import { Config } from "../../config";
import { RC } from "../../rc";
import { Context } from "./args";
import release from "./release";
import { expect } from "chai";
import * as experiments from "../../experiments";

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

describe("apphosting", () => {
  let isEnabledStub: sinon.SinonStub;
  let orchestrateRolloutStub: sinon.SinonStub;
  let getBackendStub: sinon.SinonStub;

  beforeEach(() => {
    isEnabledStub = sinon.stub(experiments, "isEnabled").returns(false);
    getBackendStub = sinon.stub(backend, "getBackend").resolves({ uri: "https://foo-us-central1.a.run.app" } as any);
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("release", () => {
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

    it("does not block rollouts of other backends if one rollout fails", async () => {
      const context: Context = {
        backendConfigs: {
          foo: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
          },
        },
        backendLocations: { foo: "us-central1" },
        backendStorageUris: {
          foo: "gs://firebaseapphosting-sources-us-central1/foo-1234.zip",
        },
        backendLocalBuilds: {},
      };

      orchestrateRolloutStub = sinon
        .stub(rollout, "orchestrateRollout")
        .throws("Unexpected orchestrateRollout call");

      orchestrateRolloutStub.onFirstCall().rejects();
      orchestrateRolloutStub.onSecondCall().resolves();

      await expect(release(context, opts)).to.eventually.not.rejected;
    });

    it("uses archive for standard source deployments", async () => {
      const context: Context = {
        backendConfigs: {
          foo: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
          },
        },
        backendLocations: { foo: "us-central1" },
        backendStorageUris: {
          foo: "gs://bucket/source.zip",
        },
        backendLocalBuilds: {},
      };

      orchestrateRolloutStub = sinon.stub(rollout, "orchestrateRollout").resolves();

      await release(context, opts);

      expect(orchestrateRolloutStub).to.be.calledOnceWith(sinon.match({
        buildInput: {
          source: {
            archive: {
              userStorageUri: "gs://bucket/source.zip",
              rootDirectory: "/",
            },
          },
        },
      }));
    });

    it("uses locallyBuilt for local builds when experiment is enabled", async () => {
      isEnabledStub.withArgs("apphostinglocalbuilds").returns(true);
      const context: Context = {
        backendConfigs: {
          foo: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        },
        backendLocations: { foo: "us-central1" },
        backendStorageUris: {
          foo: "gs://bucket/built.tar.gz",
        },
        backendLocalBuilds: {
          foo: {
            buildDir: "dist",
            buildConfig: {},
            annotations: {},
          },
        },
      };

      orchestrateRolloutStub = sinon.stub(rollout, "orchestrateRollout").resolves();

      await release(context, opts);

      expect(orchestrateRolloutStub).to.be.calledOnceWith(sinon.match({
        buildInput: {
          source: {
            locallyBuilt: {
              userStorageUri: "gs://bucket/built.tar.gz",
            },
          },
        },
      }));
    });

    it("skips local builds when experiment is disabled", async () => {
      isEnabledStub.withArgs("apphostinglocalbuilds").returns(false);
      const context: Context = {
        backendConfigs: {
          foo: {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        },
        backendLocations: { foo: "us-central1" },
        backendStorageUris: {
          foo: "gs://bucket/built.tar.gz",
        },
        backendLocalBuilds: {
          foo: {
            buildDir: "dist",
            buildConfig: {},
            annotations: {},
          },
        },
      };

      orchestrateRolloutStub = sinon.stub(rollout, "orchestrateRollout").resolves();

      await release(context, opts);

      expect(orchestrateRolloutStub).to.not.be.called;
    });
  });
});
