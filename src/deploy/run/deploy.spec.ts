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
import { deploy } from "./deploy";

describe("run deploy", () => {
  const options = { config: { projectDir: "/p" } } as unknown as Options;
  const config = { serviceId: "s", region: "us-central1", rootDir: "web" };
  let sourceArchiveStub: sinon.SinonStub;
  let rmSyncStub: sinon.SinonStub;
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
    rmSyncStub = sinon.stub(fs, "rmSync");
    sourceArchiveStub = sinon.stub(apphostingUtil, "createSourceDeployArchive").resolves("src.zip");
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
    expect(rmSyncStub).to.have.been.calledWith("src.zip", { force: true });
    const imageUri = "us-central1-docker.pkg.dev/p/cloud-run-source-deploy/s:42";
    expect(submitBuildStub).to.have.been.calledWith("p", "us-central1", {
      storageSource: { bucket: "bucket", object: "src.zip" },
      imageUri,
      buildpackBuild: {
        baseImage: "nodejs22",
        enableAutomaticUpdates: true,
        environmentVariables: {
          X_GOOGLE_TARGET_PLATFORM: "fah",
          FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
        },
      },
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
    expect(submitBuildStub.firstCall.args[2].buildpackBuild).to.deep.equal({
      environmentVariables: {
        X_GOOGLE_TARGET_PLATFORM: "fah",
        FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
      },
    });
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

  it("logs the deployed URL of each service during release", async () => {
    const { release } = await import("./release");
    const utils = await import("../../utils");
    const logStub = sinon.stub(utils, "logLabeledSuccess");

    await release({ projectId: "p" }, options, {
      run: {
        services: [service({ deployed: { uri: "https://s-123.run.app" } as runv2.Service })],
      },
    });

    expect(logStub).to.have.been.calledOnceWithExactly(
      "run",
      "Deployed service s to https://s-123.run.app",
    );
  });
});
