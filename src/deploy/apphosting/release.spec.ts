import * as sinon from "sinon";
import * as rollout from "../../apphosting/rollout";
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
  });
});
