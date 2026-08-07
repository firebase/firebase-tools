import { expect } from "chai";
import * as sinon from "sinon";
import { prepare } from "./prepare";
import * as runv2 from "../../gcp/runv2";
import * as prereqs from "./prereqs";
import { Options } from "../../options";
import { Context, Payload } from "./args";
import { FirebaseError } from "../../error";

describe("run prepare", () => {
  let prereqsStub: sinon.SinonStub;
  let getServiceStub: sinon.SinonStub;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    prereqsStub = sinon.stub(prereqs, "prereqs").resolves();
    getServiceStub = sinon.stub(runv2, "getService");
  });

  afterEach(() => {
    process.env = originalEnv;
    sinon.restore();
  });

  it("should throw FirebaseError if no run config is configured in firebase.json", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: { get: () => undefined, path: (p: string) => p },
    } as unknown as Options;

    await expect(prepare(context, options, payload)).to.be.rejectedWith(
      FirebaseError,
      "No Cloud Run services configured in firebase.json. Run 'firebase init run' to set up a service.",
    );
  });

  it("should load run service configuration from firebase.json", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: {
        get: () => ({ serviceId: "my-service", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.resolves(undefined);

    await prepare(context, options, payload);

    expect(prereqsStub.calledOnce).to.be.true;
    expect(context.projectId).to.equal("project");
    expect(payload.run?.services).to.have.length(1);
    expect(payload.run?.services?.[0].serviceId).to.equal("my-service");
    expect(payload.run?.services?.[0].region).to.equal("us-central1");
  });

  it("should respect FIREBASE_RUN_REGION environment variable", async () => {
    process.env.FIREBASE_RUN_REGION = "europe-west1";
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: {
        get: () => ({ serviceId: "my-service", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.resolves(undefined);

    await prepare(context, options, payload);

    expect(payload.run?.services?.[0].region).to.equal("europe-west1");
  });

  it("should fetch existing service and base image", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: {
        get: () => ({ serviceId: "mysvc", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.resolves({
      template: {
        containers: [{ baseImageUri: "some-uri" }],
      },
    } as runv2.Service);

    await prepare(context, options, payload);

    expect(prereqsStub.calledOnce).to.be.true;
    expect(payload.run?.services).to.have.length(1);
    expect(payload.run?.services?.[0].baseImageUri).to.equal("some-uri");
  });

  it("should override existing base image if specified in firebase.json", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: {
        get: () => ({
          serviceId: "mysvc",
          region: "us-central1",
          source: ".",
          baseImageUri: "override-uri",
        }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.resolves({
      template: {
        containers: [{ baseImageUri: "some-uri" }],
      },
    } as runv2.Service);

    await prepare(context, options, payload);

    expect(payload.run?.services?.[0].baseImageUri).to.equal("override-uri");
  });

  it("should support --runtime flag override", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      runtime: "nodejs22",
      config: {
        get: () => ({ serviceId: "mysvc", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.resolves({
      template: {
        containers: [{ baseImageUri: "old-uri" }],
      },
    } as runv2.Service);

    await prepare(context, options, payload);

    expect(payload.run?.services?.[0].baseImageUri).to.equal("nodejs22");
    expect(payload.run?.services?.[0].clearBaseImage).to.be.false;
  });

  it("should support --clear-runtime flag", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      clearRuntime: true,
      config: {
        get: () => ({ serviceId: "mysvc", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.resolves({
      template: {
        containers: [{ baseImageUri: "old-uri" }],
      },
    } as runv2.Service);

    await prepare(context, options, payload);

    expect(payload.run?.services?.[0].baseImageUri).to.be.undefined;
    expect(payload.run?.services?.[0].clearBaseImage).to.be.true;
  });

  it("should throw error if both --runtime and --clear-runtime are specified", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      runtime: "nodejs22",
      clearRuntime: true,
      config: {
        get: () => ({ serviceId: "mysvc", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    await expect(prepare(context, options, payload)).to.be.rejectedWith(
      FirebaseError,
      "Cannot specify both --runtime/--base-image and --clear-runtime/--clear-base-image.",
    );
  });

  it("should filter multi-service configurations using --only run:<serviceId>", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      only: "run:svc-2",
      config: {
        get: () => [
          { serviceId: "svc-1", region: "us-central1", source: "." },
          { serviceId: "svc-2", region: "us-east1", source: "." },
        ],
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.resolves(undefined);

    await prepare(context, options, payload);

    expect(payload.run?.services).to.have.length(1);
    expect(payload.run?.services?.[0].serviceId).to.equal("svc-2");
  });

  it("should throw FirebaseError when --only filter does not match any configured service", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      only: "run:non-existent",
      config: {
        get: () => [
          { serviceId: "svc-1", region: "us-central1", source: "." },
          { serviceId: "svc-2", region: "us-east1", source: "." },
        ],
        path: (p: string) => p,
      },
    } as unknown as Options;

    await expect(prepare(context, options, payload)).to.be.rejectedWith(
      FirebaseError,
      "No Cloud Run services in firebase.json match filter 'run:non-existent'.",
    );
  });

  it("should throw FirebaseError if serviceId is missing", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: {
        get: () => ({ serviceId: "", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    await expect(prepare(context, options, payload)).to.be.rejectedWith(
      FirebaseError,
      "Cloud Run serviceId must be specified in firebase.json.",
    );
  });

  it("should ignore 404 error from getService and proceed", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: {
        get: () => ({ serviceId: "new-svc", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.rejects({ status: 404 });

    await prepare(context, options, payload);

    expect(payload.run?.services?.[0].existingService).to.be.undefined;
  });

  it("should propagate non-404 error from getService", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: {
        get: () => ({ serviceId: "new-svc", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.rejects({ status: 500, message: "Internal server error" });

    await expect(prepare(context, options, payload)).to.be.rejected;
  });

  it("should support multiple service configurations in firebase.json", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {
      project: "project",
      config: {
        get: () => [
          { serviceId: "svc-1", region: "us-central1", source: "." },
          { serviceId: "svc-2", region: "us-east1", source: "." },
        ],
        path: (p: string) => p,
      },
    } as unknown as Options;

    getServiceStub.resolves(undefined);

    await prepare(context, options, payload);

    expect(payload.run?.services).to.have.length(2);
    expect(payload.run?.services?.[0].serviceId).to.equal("svc-1");
    expect(payload.run?.services?.[1].serviceId).to.equal("svc-2");
  });
});
