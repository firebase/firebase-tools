import { expect } from "chai";
import * as fs from "fs";
import * as sinon from "sinon";
import * as localbuilds from "../../apphosting/localbuilds";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import * as getProjectNumber from "../../getProjectNumber";
import { Options } from "../../options";
import * as apphostingPrepare from "../apphosting/prepare";
import * as apphostingUtil from "../apphosting/util";
import { ServiceDeploy } from "./args";
import { deploy, localBuildTemplate, revisionTemplate } from "./deploy";

const NODEJS22 = "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22";
const DEPLOY_MESSAGE = "firebase.google.com/deploy-message";
const APP_ID = "firebase.google.com/app-id";

describe("run deploy", () => {
  const options = { config: { projectDir: "/project" } } as unknown as Options;
  const web = { serviceId: "web", region: "us-central1", rootDir: "apps/web" };
  // Date.now() is stubbed to return 42, which tags the image.
  const image = "us-central1-docker.pkg.dev/my-project/cloud-run-source-deploy/web:42";
  const scratchDir = "/tmp/run-local-build-web-abc123";
  const builtApp = { bucket: "source-bucket", object: "web.tar.gz" };
  let createArchiveStub: sinon.SinonStub;
  let submitBuildStub: sinon.SinonStub;
  let createServiceStub: sinon.SinonStub;
  let updateServiceStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("123");
    sinon.stub(gcs, "upsertBucket").resolves("source-bucket");
    createArchiveStub = sinon
      .stub(apphostingUtil, "createSourceDeployArchive")
      .resolves("/tmp/web.zip");
    sinon.stub(fs, "createReadStream").returns("stream" as unknown as fs.ReadStream);
    sinon
      .stub(gcs, "uploadObject")
      .resolves({ bucket: "source-bucket", object: "web.zip", generation: "1" });
    sinon.stub(artifactregistry, "ensureDockerRepository").resolves();
    submitBuildStub = sinon.stub(runv2, "submitBuild").resolves();
    const deployed = { uri: "https://web.run.app" } as runv2.Service;
    createServiceStub = sinon.stub(runv2, "createService").resolves(deployed);
    updateServiceStub = sinon.stub(runv2, "updateService").resolves(deployed);
    sinon.stub(Date, "now").returns(42);
  });

  afterEach(() => sinon.restore());

  async function deployOne(svc: ServiceDeploy): Promise<ServiceDeploy> {
    await deploy({ projectId: "my-project" }, options, { run: { services: [svc] } });
    return svc;
  }

  it("uploads the source, builds it, and creates a public service", async () => {
    const svc = await deployOne({ config: web, baseImage: NODEJS22 });

    expect(createArchiveStub).to.have.been.calledWithMatch(
      { backendId: "web" },
      "/project/apps/web",
    );
    expect(submitBuildStub).to.have.been.calledWithMatch("my-project", "us-central1", {
      storageSource: { bucket: "source-bucket", object: "web.zip" },
      imageUri: image,
      buildpackBuild: { baseImage: NODEJS22, enableAutomaticUpdates: true },
    });
    expect(createServiceStub).to.have.been.calledWithMatch("my-project", "us-central1", "web", {
      template: { containers: [{ name: "web", image, baseImageUri: NODEJS22 }] },
      invokerIamDisabled: true,
      ingress: "INGRESS_TRAFFIC_ALL",
    });
    expect(svc.deployed).to.deep.equal({ uri: "https://web.run.app" });
  });

  it("builds without a base image if the service doesn't have one", async () => {
    await deployOne({ config: web });

    // Without a base image, Cloud Build can't turn on automatic base image updates.
    const { buildpackBuild } = submitBuildStub.firstCall.args[2];
    expect(buildpackBuild).not.to.have.property("baseImage");
    expect(buildpackBuild).not.to.have.property("enableAutomaticUpdates");
  });

  it("passes the service's plain build env vars to Cloud Build, but never secrets", async () => {
    const buildEnv = { API_URL: "https://api.example.com", NPM_TOKEN: { secret: "npm-token" } };

    await deployOne({ config: web, buildEnv });

    const { environmentVariables } = submitBuildStub.firstCall.args[2].buildpackBuild;
    expect(environmentVariables).to.include({ API_URL: "https://api.example.com" });
    expect(environmentVariables).not.to.have.property("NPM_TOKEN");
  });

  it("rolls out a new revision of an existing service with all traffic, keeping its tags", async () => {
    const existing = {
      name: "projects/my-project/locations/us-central1/services/web",
      template: { revision: "web-001", containers: [{ name: "web", image: "old-image" }] },
      traffic: [
        { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: "web-001", percent: 90 },
        {
          type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
          revision: "web-000",
          tag: "preview",
          percent: 10,
        },
      ],
    } as unknown as runv2.Service;

    await deployOne({ config: web, existing });

    expect(createServiceStub).not.to.have.been.called;
    expect(updateServiceStub).to.have.been.calledOnceWithExactly(
      {
        name: "projects/my-project/locations/us-central1/services/web",
        annotations: {},
        template: { containers: [{ name: "web", image }] },
        traffic: [
          { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
          { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: "web-000", tag: "preview" },
        ],
      },
      { updateMask: ["template", "traffic", "annotations"], pollTimeoutMs: 10 * 60 * 1000 },
    );
  });

  describe("linked Firebase Web App", () => {
    const linkedWeb = {
      name: "projects/my-project/locations/us-central1/services/web",
      annotations: { team: "frontend", [APP_ID]: "1:123:web:abc" },
      template: { containers: [{ name: "web", image: "old-image" }] },
    } as unknown as runv2.Service;

    it("is saved on a new service", async () => {
      await deployOne({ config: web, autoInit: { appId: "1:123:web:abc", firebaseConfig: "{}" } });

      expect(createServiceStub).to.have.been.calledWithMatch("my-project", "us-central1", "web", {
        annotations: { [APP_ID]: "1:123:web:abc" },
      });
    });

    it("replaces the app saved on an existing service", async () => {
      await deployOne({
        config: web,
        existing: linkedWeb,
        autoInit: { appId: "1:123:web:def", firebaseConfig: "{}" },
      });

      expect(updateServiceStub).to.have.been.calledWithMatch(
        { annotations: { team: "frontend", [APP_ID]: "1:123:web:def" } },
        { updateMask: ["template", "traffic", "annotations"] },
      );
    });

    it("is removed when the service is unlinked", async () => {
      await deployOne({ config: web, existing: linkedWeb });

      expect(updateServiceStub.firstCall.args[0].annotations).to.deep.equal({ team: "frontend" });
    });

    it("keeps the service's annotations as they are if the app didn't change", async () => {
      await deployOne({
        config: web,
        existing: linkedWeb,
        autoInit: { appId: "1:123:web:abc", firebaseConfig: "{}" },
      });

      expect(updateServiceStub.firstCall.args[0].annotations).to.deep.equal({
        team: "frontend",
        [APP_ID]: "1:123:web:abc",
      });
    });
  });

  describe("local builds", () => {
    const localWeb = { ...web, localBuild: true };
    let rmSyncStub: sinon.SinonStub;
    let validateNodeStub: sinon.SinonStub;
    let localBuildStub: sinon.SinonStub;
    let tarArchiveStub: sinon.SinonStub;

    beforeEach(() => {
      sinon.stub(fs, "mkdtempSync").returns(scratchDir);
      rmSyncStub = sinon.stub(fs, "rmSync");
      validateNodeStub = sinon.stub(localbuilds, "validateLocalBuildNodeVersion");
      sinon.stub(apphostingPrepare, "prepareLocalBuildScratchDirectory").resolves();
      localBuildStub = sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: [".next"],
        buildConfig: { runCommand: "npm run start" },
      });
      tarArchiveStub = sinon
        .stub(apphostingUtil, "createLocalBuildTarArchive")
        .resolves("/tmp/web.tar.gz");
      (gcs.uploadObject as sinon.SinonStub)
        .withArgs(sinon.match({ file: "/tmp/web.tar.gz" }))
        .resolves(builtApp);
    });

    /** Deploys web with "localBuild": true and returns the container that it rolled out. */
    async function deployLocalBuild(): Promise<runv2.Container> {
      await deployOne({ config: localWeb, baseImage: NODEJS22 });
      return createServiceStub.firstCall.args[3].template.containers[0];
    }

    it("builds on this machine, in a scratch folder that it deletes afterwards", async () => {
      await deployLocalBuild();

      expect(validateNodeStub).to.have.been.calledWith(
        { runtime: { value: "nodejs22" } },
        "/project/apps/web",
      );
      expect(localBuildStub).to.have.been.calledWithMatch(
        "my-project",
        scratchDir,
        {},
        { rootDir: "apps/web" },
      );
      expect(rmSyncStub).to.have.been.calledWith(scratchDir);
    });

    it("uploads the build's output and runs it as is, without Cloud Build", async () => {
      const container = await deployLocalBuild();

      expect(tarArchiveStub).to.have.been.calledWithMatch(sinon.match.any, scratchDir, [".next"]);
      expect(submitBuildStub).not.to.have.been.called;
      expect(container).to.deep.include({
        image: "scratch",
        sourceCode: { cloudStorageSource: builtApp },
        command: ["npm", "run", "start"],
      });
    });

    it("keeps the env vars the app needs at runtime", async () => {
      localBuildStub.resolves({
        outputFiles: [".next"],
        buildConfig: {
          env: [
            { variable: "NODE_ENV", value: "production", availability: ["RUNTIME"] },
            { variable: "NEXT_TELEMETRY_DISABLED", value: "1", availability: ["BUILD"] },
          ],
        },
      });

      const container = await deployLocalBuild();

      expect(container.env).to.deep.equal([{ name: "NODE_ENV", value: "production" }]);
    });

    it("passes the build env, secrets included, to the local build", async () => {
      const buildEnv = {
        API_URL: "https://api.example.com",
        NPM_TOKEN: { secret: "npm-token@2" },
      };

      await deployOne({ config: localWeb, baseImage: NODEJS22, buildEnv });

      expect(localBuildStub).to.have.been.calledWithMatch(
        "my-project",
        scratchDir,
        { API_URL: { value: "https://api.example.com" }, NPM_TOKEN: { secret: "npm-token@2" } },
        { allowLocalBuildSecrets: true },
      );
    });

    it("cleans up and deploys nothing if the local build fails", async () => {
      localBuildStub.rejects(new Error("next build failed"));

      await expect(deployLocalBuild()).to.be.rejectedWith("next build failed");

      expect(rmSyncStub).to.have.been.calledWith(scratchDir);
      expect(createServiceStub).not.to.have.been.called;
    });

    it("reports the local build error, not the cleanup error, when both fail", async () => {
      localBuildStub.rejects(new Error("next build failed"));
      rmSyncStub.throws(new Error("EBUSY: resource busy or locked"));

      await expect(deployLocalBuild()).to.be.rejectedWith("next build failed");
    });
  });

  describe("revisionTemplate", () => {
    const existing = {
      name: "projects/my-project/locations/us-central1/services/web",
      template: {
        revision: "web-001",
        serviceAccount: "web@my-project.iam.gserviceaccount.com",
        annotations: { team: "frontend", [DEPLOY_MESSAGE]: "Last deploy" },
        containers: [
          {
            name: "web",
            image: "old-image",
            baseImageUri: NODEJS22,
            env: [{ name: "MODE", value: "prod" }],
          },
        ],
      },
    } as unknown as runv2.Service;

    /** The live web service, running a container with these fields. */
    function webRunning(container: Partial<runv2.Container>): runv2.Service {
      return {
        template: { containers: [{ name: "web", image: "old-image", ...container }] },
      } as runv2.Service;
    }

    it("starts a new service with just the image", () => {
      expect(revisionTemplate({ config: web }, image)).to.deep.equal({
        containers: [{ name: "web", image }],
      });
    });

    it("keeps the live revision's settings, but not its name", () => {
      const template = revisionTemplate({ config: web, existing, baseImage: NODEJS22 }, image);

      expect(template).to.deep.equal({
        serviceAccount: "web@my-project.iam.gserviceaccount.com",
        annotations: { team: "frontend" },
        containers: [
          { name: "web", image, baseImageUri: NODEJS22, env: [{ name: "MODE", value: "prod" }] },
        ],
      });
      // The live service itself isn't changed.
      expect(existing.template.revision).to.equal("web-001");
    });

    it("sets the base image, or clears it", () => {
      const withBaseImage = revisionTemplate(
        { config: web, existing, baseImage: "nodejs24" },
        image,
      );
      expect(withBaseImage.containers?.[0].baseImageUri).to.equal("nodejs24");

      const withoutBaseImage = revisionTemplate({ config: web, existing }, image);
      expect(withoutBaseImage.containers?.[0]).not.to.have.property("baseImageUri");
    });

    it("sets the deploy message, or clears the last one", () => {
      const withMessage = revisionTemplate({ config: web, existing }, image, "Fix the login page");
      expect(withMessage.annotations).to.deep.equal({
        team: "frontend",
        [DEPLOY_MESSAGE]: "Fix the login page",
      });

      const withoutMessage = revisionTemplate({ config: web, existing }, image);
      expect(withoutMessage.annotations).to.deep.equal({ team: "frontend" });
    });

    it("switches a service from a local build back to an image", () => {
      const fromLocalBuild = webRunning({
        image: "scratch",
        command: ["npm", "run", "start"],
        sourceCode: { cloudStorageSource: builtApp },
      });

      const template = revisionTemplate({ config: web, existing: fromLocalBuild }, image);

      expect(template).to.deep.equal({ containers: [{ name: "web", image }] });
    });

    describe("FIREBASE_CONFIG", () => {
      /** The live web service, with FIREBASE_CONFIG set to `value`. */
      function withConfig(value: string): runv2.Service {
        return webRunning({ env: [{ name: "FIREBASE_CONFIG", value }] });
      }
      const linked = { ...withConfig("old"), annotations: { [APP_ID]: "1:123:web:abc" } };

      it("is set from the linked app's current config", () => {
        const svc = {
          config: web,
          existing: linked,
          autoInit: { appId: "1:123:web:abc", firebaseConfig: "current" },
        };

        const template = revisionTemplate(svc, image);

        expect(template.containers?.[0].env).to.deep.equal([
          { name: "FIREBASE_CONFIG", value: "current" },
        ]);
      });

      it("is removed when the app is unlinked, and the other env vars stay", () => {
        const existing = {
          ...webRunning({
            env: [
              { name: "MODE", value: "prod" },
              { name: "FIREBASE_CONFIG", value: "old" },
            ],
          }),
          annotations: { [APP_ID]: "1:123:web:abc" },
        };

        const template = revisionTemplate({ config: web, existing }, image);

        expect(template.containers?.[0].env).to.deep.equal([{ name: "MODE", value: "prod" }]);
      });

      it("is left alone if the user set it on a service that was never linked", () => {
        const svc = { config: web, existing: withConfig("mine") };

        const template = revisionTemplate(svc, image);

        expect(template.containers?.[0].env).to.deep.equal([
          { name: "FIREBASE_CONFIG", value: "mine" },
        ]);
      });
    });

    describe("localBuildTemplate", () => {
      it("runs a local build's output with the build's start command", () => {
        // The command is split on whitespace, so stray spaces don't become empty arguments.
        const build = { outputFiles: [".next"], runCommand: " npm  run start ", env: [] };

        const template = localBuildTemplate({ config: web, existing }, build, builtApp);

        expect(template.containers?.[0]).to.deep.include({
          image: "scratch",
          sourceCode: { cloudStorageSource: builtApp },
          command: ["npm", "run", "start"],
        });
      });

      it("sets the env vars the build reports, replacing the service's values for the same names", () => {
        const service = webRunning({
          env: [
            { name: "MODE", value: "prod" },
            { name: "API_URL", value: "https://api.example.com" },
          ],
        });
        const build = {
          outputFiles: [".next"],
          env: [
            { name: "MODE", value: "development" },
            { name: "NODE_ENV", value: "production" },
          ],
        };

        const template = localBuildTemplate({ config: web, existing: service }, build, builtApp);

        // API_URL isn't from the build, so it's kept.
        expect(template.containers?.[0].env).to.deep.equal([
          { name: "API_URL", value: "https://api.example.com" },
          { name: "MODE", value: "development" },
          { name: "NODE_ENV", value: "production" },
        ]);
      });
    });
  });
});
