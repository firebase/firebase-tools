import { expect } from "chai";
import * as sinon from "sinon";
import { deploy } from "./deploy";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import * as artifactRegistry from "../../gcp/artifactregistry";
import * as archiveDirectory from "../../archiveDirectory";

describe("run deploy", () => {
  let upsertBucketStub: sinon.SinonStub;
  let submitBuildStub: sinon.SinonStub;
  let updateServiceStub: sinon.SinonStub;
  let createServiceStub: sinon.SinonStub;
  let ensureRepoStub: sinon.SinonStub;

  beforeEach(() => {
    upsertBucketStub = sinon.stub(gcs, "upsertBucket").resolves("my-bucket");
    ensureRepoStub = sinon.stub(artifactRegistry, "ensureRepository").resolves();
    sinon.stub(archiveDirectory, "archiveDirectory").resolves({
      file: "test.zip",
      stream: "mock-stream" as any,
      size: 100,
      source: ".",
      manifest: [],
    });
    sinon.stub(gcs, "uploadObject").resolves({
      bucket: "my-bucket",
      object: "test.zip",
      generation: "123",
    });
    submitBuildStub = sinon
      .stub(runv2, "submitBuild")
      .resolves({ baseImageUri: "dummy-base-image" });
    updateServiceStub = sinon
      .stub(runv2, "updateService")
      .resolves({ uri: "https://my-service.com" } as any);
    createServiceStub = sinon
      .stub(runv2, "createService")
      .resolves({ uri: "https://my-service.com" } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should deploy a new service", async () => {
    const payload: any = {
      run: {
        services: [
          {
            serviceId: "mysvc",
            region: "us-central1",
            source: ".",
            manifest: [],
            baseImageUri: "dummy-base-image",
          },
        ],
      },
    };
    const context = { projectId: "project" };
    const options = { project: "project", projectNumber: "12345" } as any;

    await deploy(context, options, payload);

    expect(upsertBucketStub.calledOnce).to.be.true;
    expect(ensureRepoStub.calledOnce).to.be.true;
    expect(submitBuildStub.calledOnce).to.be.true;
    expect(createServiceStub.calledOnce).to.be.true;
    expect(updateServiceStub.notCalled).to.be.true;

    const createdService = createServiceStub.args[0][3];
    expect(createdService.template.containers[0].baseImageUri).to.equal("dummy-base-image");

    // Check if deployResponse is set
    expect(payload.run.services[0].deployResponse.uri).to.equal("https://my-service.com");
  });

  it("should update an existing service", async () => {
    const payload: any = {
      run: {
        services: [
          {
            serviceId: "mysvc",
            region: "us-central1",
            source: ".",
            manifest: [],
            existingService: {
              name: "projects/project/locations/us-central1/services/mysvc",
              template: {
                containers: [{ image: "old-image" }],
              },
            },
          },
        ],
      },
    };
    const context = { projectId: "project" };
    const options = { project: "project", projectNumber: "12345" } as any;

    await deploy(context, options, payload);

    expect(ensureRepoStub.calledOnce).to.be.true;
    expect(updateServiceStub.calledOnce).to.be.true;
    expect(createServiceStub.notCalled).to.be.true;
    expect(payload.run.services[0].deployResponse.uri).to.equal("https://my-service.com");
  });
});
