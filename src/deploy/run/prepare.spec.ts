import { expect } from "chai";
import * as sinon from "sinon";
import { prepare } from "./prepare";
import * as runv2 from "../../gcp/runv2";
import * as prereqs from "./prereqs";

describe("run prepare", () => {
  let prereqsStub: sinon.SinonStub;
  let getServiceStub: sinon.SinonStub;

  beforeEach(() => {
    prereqsStub = sinon.stub(prereqs, "prereqs").resolves();
    getServiceStub = sinon.stub(runv2, "getService");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should initialize default run config if none specified in firebase.json", async () => {
    const payload: any = {};
    const context = { projectId: "project" };
    const options = {
      project: "project",
      config: { get: () => undefined, path: (p: string) => p },
    } as any;

    getServiceStub.resolves(undefined);

    await prepare(context, options, payload);

    expect(prereqsStub.calledOnce).to.be.true;
    expect(payload.run.services.length).to.equal(1);
    expect(payload.run.services[0].serviceId).to.equal("my-service");
  });

  it("should fetch existing service and base image", async () => {
    const payload: any = {};
    const context = { projectId: "project" };
    const options = {
      project: "project",
      config: {
        get: () => ({ serviceId: "mysvc", region: "us-central1", source: "." }),
        path: (p: string) => p,
      },
    } as any;

    getServiceStub.resolves({
      template: {
        containers: [{ baseImageUri: "some-uri" }],
      },
    });

    await prepare(context, options, payload);

    expect(prereqsStub.calledOnce).to.be.true;
    expect(payload.run.services.length).to.equal(1);
    expect(payload.run.services[0].baseImageUri).to.equal("some-uri");
  });
});
