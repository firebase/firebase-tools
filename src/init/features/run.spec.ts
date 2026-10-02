import { expect } from "chai";
import * as sinon from "sinon";
import { Setup } from "..";
import { Config } from "../../config";
import * as deploy from "../../deploy";
import * as prereqs from "../../deploy/run/prereqs";
import * as run from "../../gcp/run";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import * as prompt from "../../prompt";
import * as requirePermissions from "../../requirePermissions";
import { actuate, askQuestions, upsertRunConfig } from "./run";

describe("init run", () => {
  const options = {} as Options;
  let config: Config;
  let selectStub: sinon.SinonStub;
  let inputStub: sinon.SinonStub;

  function setup(): Setup {
    return {
      config: {},
      rcfile: { projects: {}, targets: {}, etags: {} },
      projectId: "p",
      instructions: [],
    };
  }

  beforeEach(() => {
    config = new Config({}, { projectDir: process.cwd(), cwd: process.cwd() });
    sinon.stub(requirePermissions, "requirePermissions").resolves();
    sinon.stub(prereqs, "prereqs").resolves();
    sinon.stub(run, "listLocations").resolves(["us-central1", "us-east1"]);
    sinon.stub(runv2, "getService").rejects({ status: 404 });
    selectStub = sinon.stub(prompt, "select");
    inputStub = sinon.stub(prompt, "input");
  });

  afterEach(() => sinon.restore());

  describe("askQuestions", () => {
    it("throws if no project is selected", async () => {
      await expect(
        askQuestions({ ...setup(), projectId: undefined }, config, options),
      ).to.be.rejectedWith("Cloud Run requires a Firebase project");
    });

    it("asks how to create a new service", async () => {
      selectStub.onFirstCall().resolves("create").onSecondCall().resolves("us-east1");
      inputStub.onFirstCall().resolves("my-service").onSecondCall().resolves("nodejs22");
      inputStub.onThirdCall().resolves("/");
      const s = setup();

      await askQuestions(s, config, options);

      expect(selectStub.secondCall.args[0]).to.deep.include({
        choices: ["us-central1", "us-east1"],
        default: "us-central1",
      });
      expect(inputStub.secondCall.args[0].default).to.equal("nodejs22");
      const validateDir = inputStub.thirdCall.args[0].validate;
      expect(validateDir(".")).to.be.true;
      expect(validateDir("nonexistent-dir-xyz")).to.include("does not exist");
      expect(validateDir("package.json")).to.include("does not exist");
      expect(s.featureInfo?.run).to.deep.equal({
        serviceId: "my-service",
        region: "us-east1",
        baseImage: "nodejs22",
        rootDir: "/",
      });
    });

    it("rejects invalid or taken service IDs", async () => {
      selectStub.onFirstCall().resolves("create").onSecondCall().resolves("us-central1");
      inputStub.resolves("/");
      await askQuestions(setup(), config, options);
      const validate = inputStub.firstCall.args[0].validate;

      expect(await validate("Bad_Id")).to.be.a("string");
      expect(await validate("ok-id")).to.be.true;
      (runv2.getService as sinon.SinonStub).resolves({});
      expect(await validate("ok-id")).to.equal(
        "A service named ok-id already exists in us-central1.",
      );
    });

    it("updates an existing service", async () => {
      const existing = {
        name: "projects/p/locations/europe-west1/services/web",
        template: { containers: [{ name: "web", image: "i", baseImageUri: "nodejs20" }] },
      };
      const managed = {
        name: "projects/p/locations/r/services/f",
        labels: { "goog-managed-by": "x" },
      };
      sinon.stub(runv2, "listServices").resolves([existing, managed] as unknown as runv2.Service[]);
      selectStub.onFirstCall().resolves("update").onSecondCall().resolves(existing);
      inputStub.callsFake((o) => Promise.resolve(o.default));
      const s = setup();

      await askQuestions(s, config, options);

      expect(runv2.listServices).to.have.been.calledWith("p", false);
      expect(selectStub.secondCall.args[0].choices).to.deep.equal([
        { name: "web (europe-west1)", value: existing },
      ]);
      expect(s.featureInfo?.run).to.deep.equal({
        serviceId: "web",
        region: "europe-west1",
        baseImage: "nodejs20",
        rootDir: "/",
      });
    });

    it("creates a service if there are none to update", async () => {
      sinon.stub(runv2, "listServices").resolves([]);
      selectStub.onFirstCall().resolves("update").onSecondCall().resolves("us-central1");
      inputStub.onFirstCall().resolves("my-service");
      inputStub.callsFake((o) => Promise.resolve(o.default));
      const s = setup();

      await askQuestions(s, config, options);

      expect(s.featureInfo?.run?.serviceId).to.equal("my-service");
    });

    it("enables localBuild and requires a base image when building locally", async () => {
      selectStub
        .onFirstCall()
        .resolves("create")
        .onSecondCall()
        .resolves("us-central1")
        .onThirdCall()
        .resolves(true);
      inputStub.onFirstCall().resolves("my-service");
      inputStub.callsFake((o) => Promise.resolve(o.default));
      const s = setup();

      await askQuestions(s, config, options);

      const validateImg = inputStub.secondCall.args[0].validate;
      expect(validateImg("nodejs22")).to.be.true;
      expect(validateImg(" ")).to.include("Local builds require a base image");
      expect(s.featureInfo?.run).to.deep.equal({
        serviceId: "my-service",
        region: "us-central1",
        baseImage: "nodejs22",
        rootDir: "/",
        localBuild: true,
      });
    });
  });

  describe("actuate", () => {
    it("does nothing when featureInfo.run is not set", async () => {
      const writeStub = sinon.stub(config, "writeProjectFile");
      await actuate(setup(), config, options);
      expect(writeStub).to.not.have.been.called;
    });

    it("saves the service to firebase.json and deploys it", async () => {
      const writeStub = sinon.stub(config, "writeProjectFile");
      const deployStub = sinon.stub(deploy, "deploy").resolves();
      const s = setup();
      s.featureInfo = {
        run: { serviceId: "s", region: "r", baseImage: "", rootDir: "/", localBuild: true },
      };

      await actuate(s, config, options);

      const runConfig = {
        serviceId: "s",
        rootDir: "/",
        region: "r",
        localBuild: true,
        ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
      };
      expect(config.src.run).to.deep.equal(runConfig);
      expect(writeStub).to.have.been.calledWith("firebase.json", config.src);
      expect(deployStub).to.have.been.calledWith(
        ["run"],
        { projectId: "p", config, only: "run:s" },
        { baseImage: null },
      );
    });
  });

  describe("upsertRunConfig", () => {
    it("sets a single service object when firebase.json has no run config", () => {
      const firstService = {
        serviceId: "web",
        region: "us-central1",
        rootDir: "/",
        ignore: ["node_modules"],
      };
      upsertRunConfig(firstService, config);
      expect(config.src.run).to.deep.equal(firstService);
    });

    it("converts to an array when adding a second service", () => {
      const firstService = { serviceId: "web", region: "us-central1" };
      const secondService = { serviceId: "api", region: "us-east1" };
      upsertRunConfig(firstService, config);
      upsertRunConfig(secondService, config);
      expect(config.src.run).to.deep.equal([firstService, secondService]);
    });

    it("updates an existing service in place while preserving custom ignore and updating localBuild", () => {
      config.set("run", {
        serviceId: "web",
        region: "us-central1",
        rootDir: "/",
        ignore: ["custom-ignore"],
      });

      upsertRunConfig(
        {
          serviceId: "web",
          region: "us-east1",
          rootDir: "apps/web",
          localBuild: true,
          ignore: ["default-ignore"],
        },
        config,
      );
      expect(config.src.run).to.deep.equal({
        serviceId: "web",
        region: "us-east1",
        rootDir: "apps/web",
        localBuild: true,
        ignore: ["custom-ignore"],
      });

      upsertRunConfig(
        {
          serviceId: "web",
          region: "us-east1",
          rootDir: "apps/web",
          ignore: ["default-ignore"],
        },
        config,
      );
      expect(config.src.run).to.deep.equal({
        serviceId: "web",
        region: "us-east1",
        rootDir: "apps/web",
        ignore: ["custom-ignore"],
      });
    });
  });
});
