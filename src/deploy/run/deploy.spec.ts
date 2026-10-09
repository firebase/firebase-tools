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
import * as apphostingPrepare from "../apphosting/prepare";
import * as apphostingUtil from "../apphosting/util";
import { ServiceDeploy } from "./args";
import { deploy, revisionTemplate } from "./deploy";

const NODEJS22 = "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22";
const DEPLOY_MESSAGE = "firebase.google.com/deploy-message";

describe("run deploy", () => {
  const options = { config: { projectDir: "/project" } } as unknown as Options;
  const web = { serviceId: "web", region: "us-central1", rootDir: "apps/web" };
  // Date.now() is stubbed to return 42, which tags the image.
  const image = "us-central1-docker.pkg.dev/my-project/cloud-run-source-deploy/web:42";
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
    sinon.stub(gcs, "uploadObject").callsFake((src) =>
      Promise.resolve({
        bucket: "source-bucket",
        object: path.basename(src.file),
        generation: "1",
      }),
    );
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

  it("passes the service's build env to Cloud Build", async () => {
    await deployOne({ config: web, buildEnv: { API_URL: "https://api.example.com" } });

    const { environmentVariables } = submitBuildStub.firstCall.args[2].buildpackBuild;
    expect(environmentVariables).to.include({ API_URL: "https://api.example.com" });
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
        template: { containers: [{ name: "web", image }] },
        traffic: [
          { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
          { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: "web-000", tag: "preview" },
        ],
      },
      { updateMask: ["template", "traffic"], pollTimeoutMs: 10 * 60 * 1000 },
    );
  });

  describe("local builds", () => {
    const localWeb = { ...web, localBuild: true };
    let validateNodeStub: sinon.SinonStub;
    let localBuildStub: sinon.SinonStub;
    let tarArchiveStub: sinon.SinonStub;
    let mkdtempSpy: sinon.SinonSpy;

    beforeEach(() => {
      sinon.stub(apphostingPrepare, "prepareLocalBuildScratchDirectory").resolves();
      validateNodeStub = sinon.stub(localbuilds, "validateLocalBuildNodeVersion");
      localBuildStub = sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: [".next"],
        buildConfig: { runCommand: "node server.js" },
      });
      tarArchiveStub = sinon
        .stub(apphostingUtil, "createLocalBuildTarArchive")
        .resolves("/tmp/web.tar.gz");
      mkdtempSpy = sinon.spy(fs, "mkdtempSync");
    });

    it("builds on this machine and uploads the output, without Cloud Build", async () => {
      await deployOne({ config: localWeb, baseImage: NODEJS22 });

      const scratchDir = mkdtempSpy.firstCall.returnValue as string;
      expect(validateNodeStub).to.have.been.calledWith(
        { runtime: { value: "nodejs22" } },
        "/project/apps/web",
      );
      expect(localBuildStub).to.have.been.calledWith(
        "my-project",
        scratchDir,
        {},
        {
          nonInteractive: undefined,
          allowLocalBuildSecrets: true,
          rootDir: "apps/web",
        },
      );
      expect(tarArchiveStub).to.have.been.calledWithMatch({ backendId: "web" }, scratchDir, [
        ".next",
      ]);
      expect(submitBuildStub).not.to.have.been.called;
      expect(createServiceStub.firstCall.args[3].template.containers[0]).to.deep.equal({
        name: "web",
        image: "scratch",
        sourceCode: { cloudStorageSource: { bucket: "source-bucket", object: "web.tar.gz" } },
        command: ["node", "server.js"],
        baseImageUri: NODEJS22,
      });
      expect(fs.existsSync(scratchDir)).to.be.false;
    });

    it("passes build env to the local build, and keeps the env vars the app needs at runtime", async () => {
      localBuildStub.resolves({
        outputFiles: [".next"],
        buildConfig: {
          runCommand: "node server.js",
          env: [
            { variable: "NODE_ENV", value: "production", availability: ["RUNTIME"] },
            { variable: "BUILD_ONLY", value: "x", availability: ["BUILD"] },
          ],
        },
      });
      const buildEnv = { API_URL: "https://api.example.com", TOKEN: { secret: "t", version: "2" } };

      await deployOne({ config: localWeb, baseImage: NODEJS22, buildEnv });

      expect(localBuildStub.firstCall.args[2]).to.deep.equal({
        API_URL: { value: "https://api.example.com", availability: ["BUILD"] },
        TOKEN: { secret: "t@2", availability: ["BUILD"] },
      });
      expect(createServiceStub.firstCall.args[3].template.containers[0].env).to.deep.equal([
        { name: "NODE_ENV", value: "production" },
      ]);
    });

    it("cleans up and deploys nothing if the local build fails", async () => {
      localBuildStub.rejects(new Error("boom"));

      await expect(deployOne({ config: localWeb, baseImage: NODEJS22 })).to.be.rejectedWith("boom");

      expect(fs.existsSync(mkdtempSpy.firstCall.returnValue as string)).to.be.false;
      expect(createServiceStub).not.to.have.been.called;
    });

    it("reports the local build error, not the cleanup error, when both fail", async () => {
      localBuildStub.rejects(new Error("boom"));
      sinon.stub(fs, "rmSync").throws(new Error("EBUSY"));

      await expect(deployOne({ config: localWeb, baseImage: NODEJS22 })).to.be.rejectedWith("boom");

      fs.rmdirSync(mkdtempSpy.firstCall.returnValue as string);
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
    const builtApp = { bucket: "source-bucket", object: "web.tar.gz" };

    it("starts a new service with just the image", () => {
      expect(revisionTemplate({ config: web }, { image })).to.deep.equal({
        containers: [{ name: "web", image }],
      });
    });

    it("keeps the live revision's settings, but not its name", () => {
      const template = revisionTemplate({ config: web, existing, baseImage: NODEJS22 }, { image });

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
        { image },
      );
      expect(withBaseImage.containers?.[0].baseImageUri).to.equal("nodejs24");

      const withoutBaseImage = revisionTemplate({ config: web, existing }, { image });
      expect(withoutBaseImage.containers?.[0]).not.to.have.property("baseImageUri");
    });

    it("sets the deploy message, or clears the last one", () => {
      const withMessage = revisionTemplate({ config: web, existing }, { image }, "Fix the login");
      expect(withMessage.annotations).to.deep.equal({
        team: "frontend",
        [DEPLOY_MESSAGE]: "Fix the login",
      });

      const withoutMessage = revisionTemplate({ config: web, existing }, { image });
      expect(withoutMessage.annotations).to.deep.equal({ team: "frontend" });
    });

    it("runs a local build's output with the build's start command", () => {
      const localBuild = { scratchDir: "/tmp/x", outputFiles: [], runCommand: " node  server.js " };

      const container = revisionTemplate({ config: web, existing, localBuild }, { builtApp })
        .containers?.[0];

      expect(container).to.include({ image: "scratch" });
      expect(container?.sourceCode).to.deep.equal({ cloudStorageSource: builtApp });
      expect(container?.command).to.deep.equal(["node", "server.js"]);
    });

    it("adds the env vars a local build needs, unless the service already sets them", () => {
      const env = [
        { name: "MODE", value: "from-build" },
        { name: "NODE_ENV", value: "production" },
      ];
      const localBuild = { scratchDir: "/tmp/x", outputFiles: [], env };

      const container = revisionTemplate({ config: web, existing, localBuild }, { builtApp })
        .containers?.[0];

      expect(container?.env).to.deep.equal([
        { name: "MODE", value: "prod" },
        { name: "NODE_ENV", value: "production" },
      ]);
    });

    it("switches a service from a local build back to an image", () => {
      const fromLocalBuild = {
        ...existing,
        template: {
          containers: [
            {
              name: "web",
              image: "scratch",
              command: ["node", "server.js"],
              sourceCode: { cloudStorageSource: builtApp },
            },
          ],
        },
      } as unknown as runv2.Service;

      const container = revisionTemplate({ config: web, existing: fromLocalBuild }, { image })
        .containers?.[0];

      expect(container).to.deep.equal({ name: "web", image });
    });
  });
});
