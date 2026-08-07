import { expect } from "chai";
import * as sinon from "sinon";
import { Readable } from "stream";
import { deploy } from "./deploy";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import * as artifactRegistry from "../../gcp/artifactregistry";
import * as archiveDirectory from "../../archiveDirectory";
import * as getProjectNumberModule from "../../getProjectNumber";
import { Options } from "../../options";
import { Context, Payload } from "./args";
import { AppHostingYamlConfig } from "../../apphosting/yaml";

describe("run deploy", () => {
  let upsertBucketStub: sinon.SinonStub;
  let submitBuildStub: sinon.SinonStub;
  let updateServiceStub: sinon.SinonStub;
  let createServiceStub: sinon.SinonStub;
  let ensureRepoStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;

  beforeEach(() => {
    upsertBucketStub = sinon.stub(gcs, "upsertBucket").resolves("my-bucket");
    ensureRepoStub = sinon.stub(artifactRegistry, "ensureRepository").resolves();
    getProjectNumberStub = sinon.stub(getProjectNumberModule, "getProjectNumber").resolves("12345");
    sinon.stub(archiveDirectory, "archiveDirectory").resolves({
      file: "test.zip",
      stream: Readable.from(["mock-data"]),
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
      .resolves({ uri: "https://my-service.com" } as runv2.Service);
    createServiceStub = sinon
      .stub(runv2, "createService")
      .resolves({ uri: "https://my-service.com" } as runv2.Service);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should do nothing if payload.run or payload.run.services is missing", async () => {
    const payload: Payload = {};
    const context: Context = { projectId: "project" };
    const options = { project: "project" } as unknown as Options;

    await deploy(context, options, payload);

    expect(upsertBucketStub.notCalled).to.be.true;
    expect(createServiceStub.notCalled).to.be.true;
  });

  it("should deploy a new service", async () => {
    const payload: Payload = {
      run: {
        services: [
          {
            serviceId: "mysvc",
            region: "us-central1",
            source: ".",
            ignore: [],
            baseImageUri: "dummy-base-image",
          },
        ],
      },
    };
    const context: Context = { projectId: "project" };
    const options = { project: "project", projectNumber: "12345" } as unknown as Options;

    await deploy(context, options, payload);

    expect(getProjectNumberStub.calledOnce).to.be.true;
    expect(upsertBucketStub.calledOnce).to.be.true;
    expect(ensureRepoStub.calledOnce).to.be.true;
    expect(submitBuildStub.calledOnce).to.be.true;
    expect(createServiceStub.calledOnce).to.be.true;
    expect(updateServiceStub.notCalled).to.be.true;

    const createdService = createServiceStub.args[0][3] as Omit<
      runv2.Service,
      runv2.ServiceOutputFields
    >;
    expect(createdService.template.containers?.[0].baseImageUri).to.equal("dummy-base-image");

    expect(payload.run?.services?.[0].deployResponse?.uri).to.equal("https://my-service.com");
  });

  it("should update an existing service", async () => {
    const payload: Payload = {
      run: {
        services: [
          {
            serviceId: "mysvc",
            region: "us-central1",
            source: ".",
            ignore: [],
            existingService: {
              name: "projects/project/locations/us-central1/services/mysvc",
              generation: 1,
              createTime: "now",
              updateTime: "now",
              creator: "user",
              lastModifier: "user",
              etag: "123",
              template: {
                containers: [{ name: "mysvc", image: "old-image" }],
              },
            },
          },
        ],
      },
    };
    const context: Context = { projectId: "project" };
    const options = { project: "project", projectNumber: "12345" } as unknown as Options;

    await deploy(context, options, payload);

    expect(ensureRepoStub.calledOnce).to.be.true;
    expect(updateServiceStub.calledOnce).to.be.true;
    expect(createServiceStub.notCalled).to.be.true;
    expect(payload.run?.services?.[0].deployResponse?.uri).to.equal("https://my-service.com");
  });

  it("should map secrets, runtime env vars, and RunConfig scaling", async () => {
    const appHostingConfig = AppHostingYamlConfig.empty();
    appHostingConfig.runConfig = {
      cpu: 2,
      memoryMiB: 1024,
      minInstances: 1,
      maxInstances: 10,
      concurrency: 80,
    };
    appHostingConfig.env = {
      MY_VAR: { value: "hello", availability: ["RUNTIME"] },
      MY_SECRET: { secret: "secret-name@2", availability: ["RUNTIME"] },
      MY_FULL_SECRET: {
        secret: "projects/custom-p/secrets/my-sec",
        availability: ["RUNTIME"],
      },
    };

    const payload: Payload = {
      run: {
        services: [
          {
            serviceId: "mysvc",
            region: "us-central1",
            source: ".",
            ignore: [],
            appHostingConfig,
            existingService: {
              name: "projects/my-gcp-project/locations/us-central1/services/mysvc",
              generation: 1,
              createTime: "now",
              updateTime: "now",
              creator: "user",
              lastModifier: "user",
              etag: "123",
              labels: { env: "prod" },
              annotations: { "run.googleapis.com/ingress": "all" },
              scaling: { minInstanceCount: 0 },
              ingress: "INGRESS_TRAFFIC_ALL",
              description: "My Service",
              template: {
                containers: [],
              },
            },
          },
        ],
      },
    };
    const context: Context = { projectId: "my-gcp-project" };
    const options = {
      project: "my-gcp-project",
      config: {
        path: (p: string) => p,
      },
    } as unknown as Options;

    await deploy(context, options, payload);

    expect(updateServiceStub.calledOnce).to.be.true;
    const updatedService = updateServiceStub.args[0][0] as Omit<
      runv2.Service,
      runv2.ServiceOutputFields
    >;
    const updateMask = updateServiceStub.args[0][1] as string[];

    expect(updateMask).to.include.members([
      "template",
      "labels",
      "annotations",
      "scaling",
      "ingress",
      "description",
    ]);

    expect(updatedService.scaling?.minInstanceCount).to.equal(1);
    expect(updatedService.scaling?.maxInstanceCount).to.equal(10);
    expect(updatedService.template.maxInstanceRequestConcurrency).to.equal(80);
    expect(updatedService.template.containers?.[0].resources?.limits?.cpu).to.equal("2");
    expect(updatedService.template.containers?.[0].resources?.limits?.memory).to.equal("1024Mi");

    const containerEnv = updatedService.template.containers?.[0].env;
    expect(containerEnv).to.deep.include({ name: "MY_VAR", value: "hello" });
    expect(containerEnv).to.deep.include({
      name: "MY_SECRET",
      valueSource: {
        secretKeyRef: {
          secret: "projects/my-gcp-project/secrets/secret-name",
          version: "2",
        },
      },
    });
    expect(containerEnv).to.deep.include({
      name: "MY_FULL_SECRET",
      valueSource: {
        secretKeyRef: {
          secret: "projects/custom-p/secrets/my-sec",
          version: "latest",
        },
      },
    });
  });

  it("should delete baseImageUri when service.baseImageUri is undefined on existing service", async () => {
    const payload: Payload = {
      run: {
        services: [
          {
            serviceId: "mysvc",
            region: "us-central1",
            source: ".",
            ignore: [],
            existingService: {
              name: "projects/project/locations/us-central1/services/mysvc",
              generation: 1,
              createTime: "now",
              updateTime: "now",
              creator: "user",
              lastModifier: "user",
              etag: "123",
              template: {
                containers: [{ name: "mysvc", image: "old-image", baseImageUri: "old-base-uri" }],
              },
            },
          },
        ],
      },
    };
    const context: Context = { projectId: "project" };
    const options = { project: "project" } as unknown as Options;

    await deploy(context, options, payload);

    expect(updateServiceStub.calledOnce).to.be.true;
    const updatedService = updateServiceStub.args[0][0] as Omit<
      runv2.Service,
      runv2.ServiceOutputFields
    >;
    expect(updatedService.template.containers?.[0].baseImageUri).to.be.undefined;
  });
});
