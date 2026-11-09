import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as localbuilds from "../../apphosting/localbuilds";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import * as getProjectNumber from "../../getProjectNumber";
import { Options } from "../../options";
import * as apphostingLocalBuild from "../apphosting/localBuild";
import * as apphostingUtil from "../apphosting/util";
import { ServiceDeploy } from "./args";
import { deploy, localBuildTemplate, remoteBuildConfig, revisionTemplate } from "./deploy";

const NODEJS22 = "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22";
const DEPLOY_MESSAGE = "firebase.google.com/deploy-message";
const ROLLOUT_POLLING = { pollTimeoutMs: 45 * 60 * 1000, pollMaxBackoffMs: 10 * 1000 };
const APP_ID = "firebase.google.com/app-id";

describe("run deploy", () => {
  const options = { config: { projectDir: "/project" } } as unknown as Options;
  const web = { serviceId: "web", region: "us-central1", rootDir: "apps/web" };
  const source = { bucket: "source-bucket", object: "web.zip" };
  const imageRepository = "us-central1-docker.pkg.dev/my-project/cloud-run-source-deploy/web";
  /** How Cloud Run builds web's source. */
  const buildConfig = {
    imageRepositoryUri: imageRepository,
    buildpacksBuild: {
      environmentVariables: {
        X_GOOGLE_TARGET_PLATFORM: "fah",
        FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
      },
    },
  };
  const scratchDir = "/tmp/run-local-build-web-abc123";
  const builtApp = { bucket: "source-bucket", object: "web.tar.gz" };
  const deployed = { uri: "https://web.run.app" } as runv2.Service;
  let upsertBucketStub: sinon.SinonStub;
  let createArchiveStub: sinon.SinonStub;
  let ensureRepoStub: sinon.SinonStub;
  let createServiceStub: sinon.SinonStub;
  let updateServiceStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("123");
    upsertBucketStub = sinon.stub(gcs, "upsertBucket").resolves("source-bucket");
    createArchiveStub = sinon
      .stub(apphostingUtil, "createSourceDeployArchive")
      .resolves("/tmp/web.zip");
    sinon.stub(fs, "createReadStream").returns("stream" as unknown as fs.ReadStream);
    sinon
      .stub(gcs, "uploadObject")
      .resolves({ bucket: "source-bucket", object: "web.zip", generation: "1" });
    ensureRepoStub = sinon.stub(artifactregistry, "ensureDockerRepository").resolves();
    createServiceStub = sinon.stub(runv2, "createService").resolves(deployed);
    updateServiceStub = sinon.stub(runv2, "updateService").resolves(deployed);
  });

  afterEach(() => sinon.restore());

  async function deployOne(svc: ServiceDeploy): Promise<ServiceDeploy> {
    await deploy({ projectId: "my-project" }, options, { run: { services: [svc] } });
    return svc;
  }

  it("uploads the source, builds it, and creates a public service", async () => {
    const svc = await deployOne({ config: web, baseImage: NODEJS22 });

    // The project's .gitignore files above apps/web apply too.
    expect(createArchiveStub).to.have.been.calledWithMatch(
      { backendId: "web" },
      path.join("/project", "apps/web"),
      "/project",
    );
    expect(ensureRepoStub).to.have.been.calledWith(
      "my-project",
      "us-central1",
      "cloud-run-source-deploy",
    );
    expect(createServiceStub).to.have.been.calledWithMatch("my-project", "us-central1", "web", {
      template: {
        containers: [
          {
            name: "web",
            baseImageUri: NODEJS22,
            sourceCode: { cloudStorageSource: source },
            // The build runs on the service's base image.
            buildConfig: {
              ...buildConfig,
              buildpacksBuild: { ...buildConfig.buildpacksBuild, buildBaseImageUri: NODEJS22 },
            },
          },
        ],
      },
      invokerIamDisabled: true,
      ingress: "INGRESS_TRAFFIC_ALL",
      launchStage: "ALPHA",
    });
    expect(createServiceStub.firstCall.args[4]).to.deep.equal(ROLLOUT_POLLING);
    expect(svc.deployed).to.deep.equal({ uri: "https://web.run.app" });
  });

  it("builds an app in an Nx or Turborepo monorepo from the monorepo's root", async () => {
    sinon.stub(fs, "existsSync").callsFake((file) => file === path.join("/project", "turbo.json"));

    await deployOne({ config: web });

    // The upload has the monorepo's root files, like its lockfile and shared packages.
    expect(createArchiveStub).to.have.been.calledWithMatch(
      { backendId: "web" },
      path.join("/project"),
    );
    const container = createServiceStub.firstCall.args[3].template.containers[0];
    expect(container.buildConfig.buildpacksBuild.environmentVariables).to.include({
      GOOGLE_BUILDABLE: "apps/web",
    });
  });

  it("builds without a base image if the service doesn't have one", async () => {
    await deployOne({ config: web });

    // Without a base image, Cloud Run doesn't turn on automatic base image updates.
    const container = createServiceStub.firstCall.args[3].template.containers[0];
    expect(container).not.to.have.property("baseImageUri");
    expect(container.buildConfig).to.deep.equal(buildConfig);
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
        // A container can't have both an image and a build config, so the old image is gone.
        template: {
          containers: [{ name: "web", sourceCode: { cloudStorageSource: source }, buildConfig }],
        },
        traffic: [
          { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
          { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: "web-000", tag: "preview" },
        ],
        launchStage: "ALPHA",
      },
      { updateMask: ["template", "traffic", "annotations", "launchStage"], ...ROLLOUT_POLLING },
    );
  });

  it("creates the source bucket without a rule that deletes uploads", async () => {
    await deployOne({ config: web });

    // Cloud Run reads a service's upload again whenever the service is edited.
    expect(upsertBucketStub.firstCall.args[0].req).not.to.have.property("lifecycle");
  });

  it("fails with Cloud Run's error if it can't build or start the new revision", async () => {
    const rolloutError = new Error("Build projects/123/locations/us-central1/builds/b1 failed: {}");
    createServiceStub.rejects(rolloutError);

    await expect(deployOne({ config: web })).to.be.rejectedWith(rolloutError);
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
        { updateMask: ["template", "traffic", "annotations", "launchStage"] },
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
    let validateNodeStub: sinon.SinonStub;
    let buildLocallyStub: sinon.SinonStub;

    beforeEach(() => {
      sinon.stub(fs, "mkdtempSync").returns(scratchDir);
      validateNodeStub = sinon.stub(localbuilds, "validateLocalBuildNodeVersion");
      buildLocallyStub = sinon.stub(apphostingLocalBuild, "buildLocally").resolves({
        archive: "/tmp/web.tar.gz",
        rootDirectory: "",
        buildConfig: { runCommand: "npm run start" },
      });
      (gcs.uploadObject as sinon.SinonStub)
        .withArgs(sinon.match({ file: "/tmp/web.tar.gz" }))
        .resolves(builtApp);
    });

    /** Deploys web with "localBuild": true and returns the container that it rolled out. */
    async function deployLocalBuild(): Promise<runv2.Container> {
      await deployOne({ config: localWeb, baseImage: NODEJS22 });
      return createServiceStub.firstCall.args[3].template.containers[0];
    }

    it("builds on this machine with App Hosting's local build, in a scratch folder", async () => {
      await deployLocalBuild();

      expect(validateNodeStub).to.have.been.calledWith(
        { runtime: { value: "nodejs22" } },
        "/project/apps/web",
      );
      expect(buildLocallyStub).to.have.been.calledWithMatch({
        projectId: "my-project",
        projectDir: "/project",
        config: { backendId: "web", rootDir: "apps/web", localBuild: true },
        scratchDir,
      });
    });

    it("uploads the build's output and runs it as is, without Cloud Build", async () => {
      const container = await deployLocalBuild();

      expect(gcs.uploadObject).to.have.been.calledWithMatch(
        { file: "/tmp/web.tar.gz" },
        "source-bucket",
        gcs.ContentType.TAR,
      );
      expect(ensureRepoStub).not.to.have.been.called;
      expect(container).to.deep.include({
        image: "scratch",
        sourceCode: { cloudStorageSource: builtApp },
        command: ["npm", "run", "start"],
      });
    });

    it("keeps the env vars the app needs at runtime", async () => {
      buildLocallyStub.resolves({
        archive: "/tmp/web.tar.gz",
        rootDirectory: "",
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

      expect(buildLocallyStub).to.have.been.calledWithMatch({
        projectId: "my-project",
        projectDir: "/project",
        env: {
          API_URL: { value: "https://api.example.com" },
          NPM_TOKEN: { secret: "npm-token@2" },
        },
        allowLocalBuildSecrets: true,
      });
    });

    it("deploys nothing if the local build fails", async () => {
      buildLocallyStub.rejects(new Error("next build failed"));

      await expect(deployLocalBuild()).to.be.rejectedWith("next build failed");

      expect(createServiceStub).not.to.have.been.called;
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

    it("starts a new service with just a named container", () => {
      expect(revisionTemplate({ config: web })).to.deep.equal({ containers: [{ name: "web" }] });
    });

    it("keeps the live revision's settings, but not its name or image", () => {
      const template = revisionTemplate({ config: web, existing, baseImage: NODEJS22 });

      expect(template).to.deep.equal({
        serviceAccount: "web@my-project.iam.gserviceaccount.com",
        annotations: { team: "frontend" },
        containers: [
          { name: "web", baseImageUri: NODEJS22, env: [{ name: "MODE", value: "prod" }] },
        ],
      });
      // The live service itself isn't changed.
      expect(existing.template.revision).to.equal("web-001");
    });

    it("sets the base image, or clears it", () => {
      const withBaseImage = revisionTemplate({ config: web, existing, baseImage: "nodejs24" });
      expect(withBaseImage.containers?.[0].baseImageUri).to.equal("nodejs24");

      const withoutBaseImage = revisionTemplate({ config: web, existing });
      expect(withoutBaseImage.containers?.[0]).not.to.have.property("baseImageUri");
    });

    it("sets the deploy message, or clears the last one", () => {
      const withMessage = revisionTemplate({ config: web, existing }, "Fix the login page");
      expect(withMessage.annotations).to.deep.equal({
        team: "frontend",
        [DEPLOY_MESSAGE]: "Fix the login page",
      });

      const withoutMessage = revisionTemplate({ config: web, existing });
      expect(withoutMessage.annotations).to.deep.equal({ team: "frontend" });
    });

    it("drops a local build's output and start command", () => {
      const fromLocalBuild = webRunning({
        image: "scratch",
        command: ["npm", "run", "start"],
        sourceCode: { cloudStorageSource: builtApp },
      });

      const template = revisionTemplate({ config: web, existing: fromLocalBuild });

      expect(template).to.deep.equal({ containers: [{ name: "web" }] });
    });

    it("drops the last remote build's source and build config, but keeps the command", () => {
      const fromRemoteBuild = webRunning({
        command: ["node", "server.js"],
        sourceCode: { cloudStorageSource: source },
        buildConfig,
      });

      const template = revisionTemplate({ config: web, existing: fromRemoteBuild });

      expect(template).to.deep.equal({
        containers: [{ name: "web", command: ["node", "server.js"] }],
      });
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

        const template = revisionTemplate(svc);

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

        const template = revisionTemplate({ config: web, existing });

        expect(template.containers?.[0].env).to.deep.equal([{ name: "MODE", value: "prod" }]);
      });

      it("is left alone if the user set it on a service that was never linked", () => {
        const svc = { config: web, existing: withConfig("mine") };

        const template = revisionTemplate(svc);

        expect(template.containers?.[0].env).to.deep.equal([
          { name: "FIREBASE_CONFIG", value: "mine" },
        ]);
      });
    });

    describe("localBuildTemplate", () => {
      it("runs a local build's output with the build's start command", () => {
        // The command is split on whitespace, so stray spaces don't become empty arguments.
        const build = { archive: "/tmp/web.tar.gz", runCommand: " npm  run start ", env: [] };

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
          archive: "/tmp/web.tar.gz",
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

  describe("remoteBuildConfig", () => {
    it("has Cloud Run push to the repository and build with App Hosting's buildpacks", () => {
      expect(remoteBuildConfig({ config: web }, imageRepository, "")).to.deep.equal({
        imageRepositoryUri: imageRepository,
        buildpacksBuild: {
          environmentVariables: {
            X_GOOGLE_TARGET_PLATFORM: "fah",
            FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
          },
        },
      });
    });

    it("builds on the service's base image, if it has one", () => {
      const withBaseImage = remoteBuildConfig(
        { config: web, baseImage: NODEJS22 },
        imageRepository,
        "",
      );
      expect(withBaseImage.buildpacksBuild?.buildBaseImageUri).to.equal(NODEJS22);

      const withoutBaseImage = remoteBuildConfig({ config: web }, imageRepository, "");
      expect(withoutBaseImage.buildpacksBuild).not.to.have.property("buildBaseImageUri");
    });

    it("tells the buildpacks where the app is in a monorepo", () => {
      const config = remoteBuildConfig({ config: web }, imageRepository, "apps/web");

      expect(config.buildpacksBuild?.environmentVariables).to.include({
        GOOGLE_BUILDABLE: "apps/web",
      });
    });

    it("passes the build env's plain values, but never its secrets", () => {
      const buildEnv = { API_URL: "https://api.example.com", NPM_TOKEN: { secret: "npm-token" } };

      const config = remoteBuildConfig({ config: web, buildEnv }, imageRepository, "");

      const env = config.buildpacksBuild?.environmentVariables;
      expect(env).to.include({ API_URL: "https://api.example.com" });
      expect(env).not.to.have.property("NPM_TOKEN");
    });

    it("lets the build env set GOOGLE_BUILDABLE, but not App Hosting's buildpack settings", () => {
      const buildEnv = { GOOGLE_BUILDABLE: "custom/web", X_GOOGLE_TARGET_PLATFORM: "gcp" };

      const config = remoteBuildConfig({ config: web, buildEnv }, imageRepository, "apps/web");

      expect(config.buildpacksBuild?.environmentVariables).to.include({
        GOOGLE_BUILDABLE: "custom/web",
        X_GOOGLE_TARGET_PLATFORM: "fah",
      });
    });
  });
});
