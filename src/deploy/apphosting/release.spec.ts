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
  interactive: false,
  debug: false,
  filteredTargets: [],
  rc: new RC(),
  json: false,
};

function initializeContext(): Context {
  return {
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
  };
}

describe("apphosting", () => {
  let orchestrateRolloutStub: sinon.SinonStub;

  beforeEach(() => {
    orchestrateRolloutStub = sinon
      .stub(rollout, "orchestrateRollout")
      .throws("Unexpected orchestrateRollout call");
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
      const context = initializeContext();
      orchestrateRolloutStub.onFirstCall().rejects();
      orchestrateRolloutStub.onSecondCall().resolves();

      await expect(release(context, opts)).to.eventually.not.rejected;
    });
  });
});
