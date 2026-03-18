import * as sinon from "sinon";
import * as rollout from "../../apphosting/rollout";
import * as backend from "../../apphosting/backend";
import { Config } from "../../config";
import { RC } from "../../rc";
import { Context } from "./args";
import release from "./release";
import { expect } from "chai";

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
  let orchestrateRolloutStub: sinon.SinonStub;

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

    it("correctly passes buildInput for local builds", async () => {
      const context: Context = {
        backendConfigs: {
          fooLocalBuild: {
            backendId: "fooLocalBuild",
            rootDir: "/root",
            ignore: [],
            localBuild: true,
          },
        },
        backendLocations: { fooLocalBuild: "us-central1" },
        backendStorageUris: {
          fooLocalBuild: "gs://bucket/foo-local-build.tar.gz",
        },
        backendLocalBuilds: {
          fooLocalBuild: {
            buildDir: "./dist",
            buildConfig: {
              runCommand: "npm run build",
              env: [{ variable: "VAR1", value: "VALUE1" }],
            },
            annotations: {},
            env: [{ variable: "VAR2", value: "VALUE2" }],
          },
        },
      };

      const orchestrateRolloutStub = sinon.stub(rollout, "orchestrateRollout").resolves();
      sinon.stub(backend, "getBackend").resolves({ uri: "foo.apphosting.com" } as any);

      await release(context, opts);

      expect(orchestrateRolloutStub).to.be.calledWith({
        projectId: "my-project",
        backendId: "fooLocalBuild",
        location: "us-central1",
        buildInput: {
          config: {
            runCommand: "npm run build",
            env: [
              { variable: "VAR1", value: "VALUE1" },
              { variable: "VAR2", value: "VALUE2" },
            ],
          },
          source: {
            archive: {
              userStorageUri: "gs://bucket/foo-local-build.tar.gz",
              rootDirectory: "/root",
              locallyBuiltSource: true,
            },
          },
        },
      });
    });
  });
});
