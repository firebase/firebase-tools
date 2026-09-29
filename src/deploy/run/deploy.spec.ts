import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import * as getProjectNumber from "../../getProjectNumber";
import { Options } from "../../options";
import * as apphostingUtil from "../apphosting/util";
import { ServiceDeploy } from "./args";
import { deploy } from "./deploy";

describe("run deploy", () => {
  const options = { config: { projectDir: "/p" } } as unknown as Options;
  const config = { serviceId: "s", region: "us-central1", rootDir: "web" };
  let sourceArchiveStub: sinon.SinonStub;
  let tarArchiveStub: sinon.SinonStub;
  let submitBuildStub: sinon.SinonStub;
  let createServiceStub: sinon.SinonStub;
  let updateServiceStub: sinon.SinonStub;

  function service(overrides: Partial<ServiceDeploy> = {}): ServiceDeploy {
    return { config, ...overrides };
  }

  async function deployOne(svc: ServiceDeploy, opts = options) {
    await deploy({ projectId: "p" }, opts, { run: { services: [svc] } });
    return svc;
  }

  beforeEach(() => {
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("123");
    sinon.stub(gcs, "upsertBucket").resolves("bucket");
    sinon
      .stub(gcs, "uploadObject")
      .callsFake((src) => Promise.resolve({ bucket: "bucket", object: src.file, generation: "1" }));
    sinon.stub(fs, "createReadStream").returns("stream" as unknown as fs.ReadStream);
    sourceArchiveStub = sinon.stub(apphostingUtil, "createSourceDeployArchive").resolves("src.zip");
    tarArchiveStub = sinon
      .stub(apphostingUtil, "createLocalBuildTarArchive")
      .resolves("out.tar.gz");
    sinon.stub(artifactregistry, "ensureDockerRepository").resolves();
    submitBuildStub = sinon.stub(runv2, "submitBuild").resolves();
    createServiceStub = sinon
      .stub(runv2, "createService")
      .resolves({ uri: "new" } as runv2.Service);
    updateServiceStub = sinon.stub(runv2, "updateService").resolves({ uri: "up" } as runv2.Service);
    sinon.stub(Date, "now").returns(42);
  });

  afterEach(() => sinon.restore());

  it("builds source and creates a new service", async () => {
    const svc = await deployOne(service({ baseImage: "nodejs22" }), {
      ...options,
      message: "hi",
    } as Options);

    expect(sourceArchiveStub).to.have.been.calledWithMatch({ backendId: "s" }, "/p/web");
    const imageUri = "us-central1-docker.pkg.dev/p/cloud-run-source-deploy/s:42";
    expect(submitBuildStub).to.have.been.calledWith("p", "us-central1", {
      storageSource: { bucket: "bucket", object: "src.zip" },
      imageUri,
      buildpackBuild: { baseImage: "nodejs22", enableAutomaticUpdates: true },
    });
    expect(createServiceStub).to.have.been.calledWith("p", "us-central1", "s", {
      name: "projects/p/locations/us-central1/services/s",
      template: {
        containers: [
          {
            name: "s",
            image: imageUri,
            baseImageUri: "nodejs22",
          },
        ],
        annotations: { "firebase.google.com/deploy-message": "hi" },
      },
      client: "cli-firebase",
      invokerIamDisabled: true,
      ingress: "INGRESS_TRAFFIC_ALL",
    });
    expect(svc.deployed).to.deep.equal({ uri: "new" });
  });

  it("builds without a base image", async () => {
    await deployOne(service());
    expect(submitBuildStub.firstCall.args[2].buildpackBuild).to.deep.equal({});
    expect(createServiceStub.firstCall.args[3].template.containers[0]).not.to.have.property(
      "baseImageUri",
    );
  });

  it("updates the live revision template of an existing service", async () => {
    const existing = {
      name: "projects/p/locations/us-central1/services/s",
      template: {
        revision: "s-1",
        serviceAccount: "sa",
        annotations: { "firebase.google.com/deploy-message": "old", keep: "me" },
        containers: [
          { name: "sidecar", image: "side" },
          {
            name: "main",
            image: "old",
            ports: [{ containerPort: 8080 }],
            baseImageUri: "old-base",
            env: [
              { name: "B", value: "old" },
              { name: "C", value: "c" },
            ],
          },
        ],
      },
      trafficStatuses: [
        { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", revision: "s-1", percent: 100 },
      ],
    } as unknown as runv2.Service;

    await deployOne(service({ existing }));

    const [update, updateOpts] = updateServiceStub.firstCall.args;
    expect(updateOpts.updateMask).to.deep.equal(["template", "traffic"]);
    expect(update.template).to.deep.equal({
      serviceAccount: "sa",
      annotations: { keep: "me" },
      containers: [
        { name: "sidecar", image: "side" },
        {
          name: "main",
          image: "us-central1-docker.pkg.dev/p/cloud-run-source-deploy/s:42",
          ports: [{ containerPort: 8080 }],
          env: [
            { name: "B", value: "old" },
            { name: "C", value: "c" },
          ],
        },
      ],
    });
    expect(update.traffic).to.deep.equal([
      { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
    ]);
    expect(existing.template.revision).to.equal("s-1");
  });

  it("deploys local builds without building", async () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-deploy-spec-"));
    const existing = {
      name: "projects/p/locations/us-central1/services/s",
      template: { containers: [{ name: "s", image: "old" }] },
    } as unknown as runv2.Service;

    await deployOne(
      service({
        existing,
        baseImage: "nodejs22",
        localBuild: { scratchDir, outputFiles: [".next"], runCommand: "node server.js" },
      }),
    );

    expect(tarArchiveStub).to.have.been.calledWithMatch({ backendId: "s" }, scratchDir, [".next"]);
    expect(submitBuildStub).not.to.have.been.called;
    expect(updateServiceStub.firstCall.args[0].template.containers[0]).to.deep.equal({
      name: "s",
      image: "scratch",
      sourceCode: { cloudStorageSource: { bucket: "bucket", object: "out.tar.gz" } },
      command: ["node", "server.js"],
      baseImageUri: "nodejs22",
    });
    expect(fs.existsSync(scratchDir)).to.be.false;
  });

  it("switches a service from a local build back to a source build", async () => {
    const existing = {
      name: "projects/p/locations/us-central1/services/s",
      template: {
        containers: [
          {
            name: "s",
            image: "scratch",
            command: ["node", "server.js"],
            sourceCode: { cloudStorageSource: { bucket: "b", object: "o" } },
          },
        ],
      },
    } as unknown as runv2.Service;

    await deployOne(service({ existing }));

    const container = updateServiceStub.firstCall.args[0].template.containers[0];
    expect(container).not.to.have.property("sourceCode");
    expect(container).not.to.have.property("command");
  });
});
