import { expect } from "chai";
import * as sinon from "sinon";
import { Setup } from "..";
import { webApps } from "../../apphosting/app";
import { Config } from "../../config";
import * as deploy from "../../deploy";
import * as prereqs from "../../deploy/run/prereqs";
import * as run from "../../gcp/run";
import * as runv2 from "../../gcp/runv2";
import * as managementApps from "../../management/apps";
import { Options } from "../../options";
import * as prompt from "../../prompt";
import * as requirePermissions from "../../requirePermissions";
import { actuate, askQuestions, RunInfo, upsertRunConfig } from "./run";

const DEFAULT_IGNORE = ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"];

describe("init run", () => {
  const options = {} as Options;
  let config: Config;
  let selectStub: sinon.SinonStub;
  let inputStub: sinon.SinonStub;
  let getOrCreateWebAppStub: sinon.SinonStub;
  let listAppsStub: sinon.SinonStub;

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
    getOrCreateWebAppStub = sinon
      .stub(webApps, "getOrCreateWebApp")
      .resolves({ name: "my-service", id: "1:123:web:abc" });
    listAppsStub = sinon.stub(managementApps, "listFirebaseApps").resolves([]);
    selectStub = sinon.stub(prompt, "select");
    inputStub = sinon.stub(prompt, "input");
  });

  afterEach(() => sinon.restore());

  describe("askQuestions", () => {
    /** Answers init's prompts, select or input, in the order it asks them. */
    function answerPrompts(...answers: unknown[]): void {
      const nextAnswer = (): Promise<unknown> => Promise.resolve(answers.shift());
      selectStub.callsFake(nextAnswer);
      inputStub.callsFake(nextAnswer);
    }

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
      // The project has no web apps, so init doesn't ask which one to link. Actuate creates one.
      expect(selectStub).to.have.been.calledThrice;
      expect(getOrCreateWebAppStub).not.to.have.been.called;
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
        createWebApp: true,
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

    it("updates an existing service, keeping the Firebase Web App it's linked to", async () => {
      const existing = {
        name: "projects/p/locations/europe-west1/services/web",
        annotations: { "firebase.google.com/app-id": "1:123:web:def" },
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
      expect(getOrCreateWebAppStub).not.to.have.been.called;
      expect(listAppsStub).not.to.have.been.called;
      expect(s.featureInfo?.run).to.deep.equal({
        serviceId: "web",
        region: "europe-west1",
        baseImage: "nodejs20",
        rootDir: "/",
        appId: "1:123:web:def",
      });
    });

    it("asks which web app to link, with creating a new one as the default", async () => {
      listAppsStub.resolves([
        { appId: "1:123:web:abc", displayName: "web", platform: managementApps.AppPlatform.WEB },
        { appId: "1:123:web:def", platform: managementApps.AppPlatform.WEB },
      ]);
      answerPrompts("create", "us-central1", "my-service", "1:123:web:def", false, "", "/");
      const s = setup();

      await askQuestions(s, config, options);

      const appPrompt = selectStub.thirdCall.args[0];
      expect(appPrompt.default).to.equal(webApps.CREATE_NEW_FIREBASE_WEB_APP);
      expect(appPrompt.choices).to.deep.equal([
        { name: "Create a new web app", value: webApps.CREATE_NEW_FIREBASE_WEB_APP },
        { name: "web (1:123:web:abc)", value: "1:123:web:abc" },
        { name: "1:123:web:def", value: "1:123:web:def" },
      ]);
      expect(s.featureInfo?.run).to.include({ appId: "1:123:web:def" });
      expect(s.featureInfo?.run).not.to.have.property("createWebApp");
    });

    it("doesn't create a web app while asking, so quitting init leaves none behind", async () => {
      listAppsStub.resolves([{ appId: "1:123:web:abc", platform: managementApps.AppPlatform.WEB }]);
      const createNew = webApps.CREATE_NEW_FIREBASE_WEB_APP;
      answerPrompts("create", "us-central1", "my-service", createNew, false, "");
      inputStub.onThirdCall().rejects(new Error("User force closed the prompt"));

      await expect(askQuestions(setup(), config, options)).to.be.rejectedWith("force closed");

      expect(getOrCreateWebAppStub).not.to.have.been.called;
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

    it("builds a new service remotely by default", async () => {
      answerPrompts("create", "us-central1", "web", /* localBuild= */ false, "", "/");

      await askQuestions(setup(), config, options);

      const localBuildPrompt = selectStub.thirdCall.args[0];
      expect(localBuildPrompt.default).to.be.false;
    });

    it("defaults to building locally if firebase.json builds the service locally", async () => {
      const existing = { name: "projects/p/locations/europe-west1/services/web", template: {} };
      sinon.stub(runv2, "listServices").resolves([existing] as unknown as runv2.Service[]);
      config.set("run", { serviceId: "web", region: "europe-west1", localBuild: true });
      answerPrompts("update", existing, /* localBuild= */ true, "nodejs22", "/");

      await askQuestions(setup(), config, options);

      const localBuildPrompt = selectStub.thirdCall.args[0];
      expect(localBuildPrompt.default).to.be.true;
    });

    it("saves the choice to build locally, which requires a base image", async () => {
      answerPrompts("create", "us-central1", "web", /* localBuild= */ true, "nodejs22", "/");
      const initSetup = setup();

      await askQuestions(initSetup, config, options);

      const baseImagePrompt = inputStub.secondCall.args[0];
      expect(baseImagePrompt.default).to.be.undefined;
      expect(baseImagePrompt.validate(" ")).to.equal("Local builds require a base image.");
      expect(baseImagePrompt.validate("nodejs22")).to.be.true;
      expect(initSetup.featureInfo?.run).to.include({ localBuild: true });
    });
  });

  describe("actuate", () => {
    /** Init's answers for a new service. */
    const webSetup = (answers: Partial<RunInfo> = {}): Setup => ({
      ...setup(),
      featureInfo: {
        run: {
          serviceId: "web",
          region: "us-central1",
          baseImage: "nodejs22",
          rootDir: "apps/web",
          ...answers,
        },
      },
    });
    let writeStub: sinon.SinonStub;
    let deployStub: sinon.SinonStub;

    beforeEach(() => {
      writeStub = sinon.stub(config, "writeProjectFile");
      deployStub = sinon.stub(deploy, "deploy").resolves();
    });

    it("does nothing when featureInfo.run is not set", async () => {
      await actuate(setup(), config, options);
      expect(config.src.run).to.be.undefined;
      expect(deployStub).to.not.have.been.called;
    });

    it("adds the service to firebase.json, but not its base image", async () => {
      await actuate(webSetup(), config, options);

      expect(config.src.run).to.deep.equal({
        serviceId: "web",
        region: "us-central1",
        rootDir: "apps/web",
        ignore: DEFAULT_IGNORE,
      });
      // Init saves firebase.json itself, once every feature is set up.
      expect(writeStub).to.not.have.been.called;
    });

    it("saves the choice to build locally", async () => {
      await actuate(webSetup({ localBuild: true }), config, options);

      expect(config.src.run).to.include({ localBuild: true });
    });

    it("deploys only that service and region, with its base image", async () => {
      await actuate(webSetup(), config, options);

      expect(deployStub).to.have.been.calledOnceWith(
        ["run"],
        { projectId: "p", config, only: "run:web:us-central1" },
        { baseImage: "nodejs22" },
      );
    });

    it("deploys with the Firebase Web App that init linked", async () => {
      await actuate(webSetup({ appId: "1:123:web:abc" }), config, options);

      expect(getOrCreateWebAppStub).not.to.have.been.called;
      expect(deployStub).to.have.been.calledWithMatch(["run"], sinon.match.any, {
        appId: "1:123:web:abc",
      });
    });

    it("creates the new Firebase Web App, then deploys with it", async () => {
      await actuate(webSetup({ createWebApp: true }), config, options);

      expect(getOrCreateWebAppStub).to.have.been.calledOnceWith("p", null, "web");
      expect(deployStub).to.have.been.calledWithMatch(["run"], sinon.match.any, {
        appId: "1:123:web:abc",
      });
    });

    it("fails without deploying if it can't create the web app", async () => {
      // getOrCreateWebApp returns nothing, after a warning, when the project is out of web apps.
      getOrCreateWebAppStub.resolves(undefined);

      await expect(actuate(webSetup({ createWebApp: true }), config, options)).to.be.rejectedWith(
        "Couldn't create a Firebase web app for service web",
      );

      expect(deployStub).to.not.have.been.called;
    });

    it("doesn't write firebase.json if the deploy fails", async () => {
      deployStub.rejects(new Error("build failed"));

      await expect(actuate(webSetup(), config, options)).to.be.rejectedWith("build failed");

      expect(writeStub).to.not.have.been.called;
    });
  });

  describe("upsertRunConfig", () => {
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

    it("turns localBuild on for an existing service, keeping its custom ignore list", () => {
      const web = { serviceId: "web", region: "us-central1", rootDir: "/" };
      config.set("run", { ...web, ignore: ["custom-ignore"] });

      upsertRunConfig({ ...web, localBuild: true }, config);

      expect(config.src.run).to.deep.equal({ ...web, ignore: ["custom-ignore"], localBuild: true });
    });

    it("turns localBuild off for an existing service, keeping its custom ignore list", () => {
      const web = { serviceId: "web", region: "us-central1", rootDir: "/" };
      config.set("run", { ...web, ignore: ["custom-ignore"], localBuild: true });

      upsertRunConfig(web, config);

      expect(config.src.run).to.deep.equal({ ...web, ignore: ["custom-ignore"] });
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
