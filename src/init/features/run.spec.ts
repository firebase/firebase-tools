import { expect } from "chai";
import * as sinon from "sinon";
import * as runFeature from "./run";
import * as prompt from "../../prompt";
import * as fs from "fs";
import { Config } from "../../config";
import { Setup } from "../index";
import { FirebaseError } from "../../error";

function createMockSetup(overrides: Partial<Setup> = {}): Setup {
  return {
    config: {},
    rcfile: { projects: {}, targets: {}, etags: {} },
    instructions: [],
    ...overrides,
  };
}

describe("init features run", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    it("should prompt for serviceId, region, rootDir, and outputDir", async () => {
      const inputStub = sandbox.stub(prompt, "input");
      inputStub.onFirstCall().resolves("custom-service");
      inputStub.onSecondCall().resolves("us-central1");
      inputStub.onThirdCall().resolves("./src");
      inputStub.onCall(3).resolves("./dist");

      const setup = createMockSetup({ projectId: "test-project" });
      await runFeature.askQuestions(setup);

      expect(setup.featureInfo?.run).to.deep.equal({
        serviceId: "custom-service",
        region: "us-central1",
        rootDir: "./src",
        outputDir: "./dist",
      });
    });

    it("should throw FirebaseError if projectId is missing", async () => {
      const setup = createMockSetup();
      await expect(runFeature.askQuestions(setup)).to.be.rejectedWith(
        FirebaseError,
        "Project ID must be set before initializing Cloud Run.",
      );
    });
  });

  describe("actuate", () => {
    let existsSyncStub: sinon.SinonStub;

    beforeEach(() => {
      existsSyncStub = sandbox.stub(fs, "existsSync");
    });

    it("should do nothing if featureInfo.run is not present", async () => {
      const setup = createMockSetup({ projectId: "test-project" });
      const config = new Config({}, {});

      await runFeature.actuate(setup, config);

      expect(config.src.run).to.be.undefined;
    });

    it("should throw FirebaseError if projectId is missing", async () => {
      const setup = createMockSetup({
        featureInfo: {
          run: {
            serviceId: "my-svc",
            region: "us-central1",
            rootDir: ".",
            outputDir: ".run",
          },
        },
      });
      const config = new Config({}, {});

      await expect(runFeature.actuate(setup, config)).to.be.rejectedWith(
        FirebaseError,
        "Project ID must be set before initializing Cloud Run.",
      );
    });

    it("should scaffold configuration in firebase.json and write apphosting.yaml if not existing", async () => {
      const setup = createMockSetup({
        projectId: "test-project",
        featureInfo: {
          run: {
            serviceId: "my-svc",
            region: "us-central1",
            rootDir: ".",
            outputDir: ".run",
          },
        },
      });
      const config = new Config({}, {});
      sandbox.stub(config, "writeProjectFile");
      const askWriteStub = sandbox.stub(config, "askWriteProjectFile").resolves();

      existsSyncStub.returns(false);

      await runFeature.actuate(setup, config);

      const runConfigs = config.src.run as Array<{ serviceId: string }>;
      expect(runConfigs).to.be.an("array");
      expect(runConfigs[0].serviceId).to.equal("my-svc");
      expect(askWriteStub.calledOnce).to.be.true;
    });

    it("should append to existing run configs array in firebase.json", async () => {
      const setup = createMockSetup({
        projectId: "test-project",
        featureInfo: {
          run: {
            serviceId: "second-svc",
            region: "us-central1",
            rootDir: "./app2",
            outputDir: ".run",
          },
        },
      });
      const config = new Config(
        {
          run: [{ serviceId: "first-svc", region: "us-central1", source: "./app1" }],
        },
        {},
      );
      sandbox.stub(config, "writeProjectFile");
      existsSyncStub.returns(true);

      await runFeature.actuate(setup, config);

      const runConfigs = config.src.run as Array<{ serviceId: string }>;
      expect(runConfigs).to.have.length(2);
      expect(runConfigs[0].serviceId).to.equal("first-svc");
      expect(runConfigs[1].serviceId).to.equal("second-svc");
    });
  });
});
