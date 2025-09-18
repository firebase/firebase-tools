import * as sinon from "sinon";
import * as rollout from "../../apphosting/rollout";
import { Config } from "../../config";
import { AppHostingSingle } from "../../firebaseConfig";
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
    it("Supports passing localBuild information", async () => {
      const context = {
        backendConfigs: new Map<string, AppHostingSingle>([
          [
            "foo",
            {
              backendId: "foo",
              rootDir: "/",
              ignore: [],
              localBuild: true,
            },
          ],
        ]),
        backendLocations: new Map<string, string>([["foo", "us-central1"]]),
        backendStorageUris: new Map<string, string>([
          ["foo", "gs://firebaseapphosting-sources-us-central1/foo-1234.zip"],
        ]),
        backendLocalBuilds: {
          foo: {
            buildConfig: {
              env: [{ variable: "CHICKEN", value: "bok-bok" }],
            },
            buildDir: "./",
          },
        },
      };

      orchestrateRolloutStub = sinon.stub(rollout, "orchestrateRollout");

      await expect(release(context, opts)).to.eventually.not.rejected;
      sinon.assert.calledOnceWithMatch(orchestrateRolloutStub, "my-project", "us-central1", "foo", {
        config: {
          env: [{ variable: "CHICKEN", value: "bok-bok" }],
        },
        source: {
          archive: {
            userStorageUri: "gs://firebaseapphosting-sources-us-central1/foo-1234.zip",
            rootDirecotry: "/",
            locallyBuiltSource: true,
          },
        },
      });
    });

    it("does not block rollouts of other backends if one rollout fails", async () => {
      const context = {
        backendConfigs: new Map<string, AppHostingSingle>([
          [
            "foo",
            {
              backendId: "foo",
              rootDir: "/",
              ignore: [],
            },
          ],
        ]),
        backendLocations: new Map<string, string>([["foo", "us-central1"]]),
        backendStorageUris: new Map<string, string>([
          ["foo", "gs://firebaseapphosting-sources-us-central1/foo-1234.zip"],
        ]),
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
