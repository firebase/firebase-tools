import { expect } from "chai";
import * as sinon from "sinon";
import { Setup } from "..";
import { Config } from "../../config";
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

    it("asks how to create a new service, with no default base image", async () => {
      selectStub.onFirstCall().resolves("create").onSecondCall().resolves("us-east1");
      inputStub.onFirstCall().resolves("my-service").onSecondCall().resolves("");
      inputStub.onThirdCall().resolves("/");
      const s = setup();

      await askQuestions(s, config, options);

      expect(selectStub.secondCall.args[0]).to.deep.include({
        choices: ["us-central1", "us-east1"],
        default: "us-central1",
      });
      expect(inputStub.secondCall.args[0].default).to.be.undefined;
      expect(inputStub.thirdCall.args[0].default).to.equal("/");
      const validateDir = inputStub.thirdCall.args[0].validate;
      expect(validateDir(".")).to.be.true;
      expect(validateDir("nonexistent-dir-xyz")).to.include("does not exist");
      expect(validateDir("package.json")).to.include("does not exist");
      expect(s.featureInfo?.run).to.deep.equal({
        serviceId: "my-service",
        region: "us-east1",
        baseImage: "",
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

    it("defaults the root directory to the one saved for the same service and region", async () => {
      const existing = { name: "projects/p/locations/europe-west1/services/web", template: {} };
      sinon.stub(runv2, "listServices").resolves([existing] as unknown as runv2.Service[]);
      selectStub.onFirstCall().resolves("update").onSecondCall().resolves(existing);
      inputStub.callsFake((o) => Promise.resolve(o.default));
      // The same service ID in another region is a different service, so its entry is skipped.
      config.set("run", [
        { serviceId: "web", region: "us-central1", rootDir: "other-region" },
        { serviceId: "web", region: "europe-west1", rootDir: "internal/folder" },
      ]);
      const s = setup();

      await askQuestions(s, config, options);

      expect(s.featureInfo?.run?.rootDir).to.equal("internal/folder");
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
  });

  describe("actuate", () => {
    it("does nothing when featureInfo.run is not set", async () => {
      await actuate(setup(), config);
      expect(config.src.run).to.be.undefined;
    });

    it("adds the service to the config that init writes to firebase.json", async () => {
      const writeStub = sinon.stub(config, "writeProjectFile");
      const s = setup();
      s.featureInfo = { run: { serviceId: "s", region: "r", baseImage: "", rootDir: "/" } };

      await actuate(s, config);

      const runConfig = {
        serviceId: "s",
        rootDir: "/",
        region: "r",
        ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
      };
      expect(config.src.run).to.deep.equal(runConfig);
      // Init writes the file once all features are set up, so a failed init leaves it untouched.
      expect(writeStub).to.not.have.been.called;
    });
  });

  describe("upsertRunConfig", () => {
    const DEFAULT_IGNORE = ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"];

    it("sets a single service object when firebase.json has no run config", () => {
      upsertRunConfig({ serviceId: "web", region: "us-central1", rootDir: "/" }, config);
      expect(config.src.run).to.deep.equal({
        serviceId: "web",
        region: "us-central1",
        rootDir: "/",
        ignore: DEFAULT_IGNORE,
      });
    });

    it("converts to an array when adding a second service", () => {
      const firstService = { serviceId: "web", region: "us-central1", rootDir: "/" };
      const secondService = { serviceId: "api", region: "us-east1", rootDir: "api" };
      upsertRunConfig(firstService, config);
      upsertRunConfig(secondService, config);
      expect(config.src.run).to.deep.equal([
        { ...firstService, ignore: DEFAULT_IGNORE },
        { ...secondService, ignore: DEFAULT_IGNORE },
      ]);
    });

    it("updates an existing service in place while preserving existing ignore and localBuild settings", () => {
      config.set("run", {
        serviceId: "web",
        region: "us-central1",
        rootDir: "/",
        ignore: ["custom-ignore"],
        localBuild: true,
      });

      upsertRunConfig(
        {
          serviceId: "web",
          region: "us-central1",
          rootDir: "apps/web",
        },
        config,
      );

      expect(config.src.run).to.deep.equal({
        serviceId: "web",
        region: "us-central1",
        rootDir: "apps/web",
        ignore: ["custom-ignore"],
        localBuild: true,
      });
    });

    it("doesn't add an ignore list to an existing service", () => {
      config.set("run", [
        { serviceId: "web", region: "us-central1" },
        { serviceId: "api", region: "us-central1", ignore: [] },
      ]);

      upsertRunConfig({ serviceId: "web", region: "us-central1", rootDir: "/" }, config);

      expect(config.src.run).to.deep.equal([
        { serviceId: "web", region: "us-central1", rootDir: "/" },
        { serviceId: "api", region: "us-central1", ignore: [] },
      ]);
    });

    it("adds a separate entry for the same service ID in another region", () => {
      const saved = { serviceId: "web", region: "us-central1", rootDir: "apps/web", ignore: [] };
      config.set("run", { ...saved });

      upsertRunConfig({ serviceId: "web", region: "europe-west1", rootDir: "/" }, config);

      expect(config.src.run).to.deep.equal([
        saved,
        { serviceId: "web", region: "europe-west1", rootDir: "/", ignore: DEFAULT_IGNORE },
      ]);
    });
  });
});
