import { expect } from "chai";
import * as fs from "fs";
import * as sinon from "sinon";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import * as getProjectNumber from "../../getProjectNumber";
import { Options } from "../../options";
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
  });
});
