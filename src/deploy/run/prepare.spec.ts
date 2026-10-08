import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { Context, Payload } from "./args";
import { prepare } from "./prepare";
import * as prereqs from "./prereqs";

describe("run prepare", () => {
  const nodejs22 = "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22";
  const existing = {
    name: "projects/p/locations/us-central1/services/s",
    template: { containers: [{ name: "s", image: "i", baseImageUri: nodejs22 }] },
  } as unknown as runv2.Service;
  let prereqsStub: sinon.SinonStub;
  let getServiceStub: sinon.SinonStub;

  const options = (run: Record<string, unknown>): Options =>
    ({
      config: { src: { run: { serviceId: "s", region: "us-central1", ...run } }, projectDir: "/p" },
    }) as unknown as Options;

  async function prepareOne(run: Record<string, unknown> = {}, context: Partial<Context> = {}) {
    const payload: Payload = {};
    await prepare({ projectId: "p", ...context }, options(run), payload);
    return payload.run!.services[0];
  }

  beforeEach(() => {
    prereqsStub = sinon.stub(prereqs, "prereqs").resolves();
    getServiceStub = sinon.stub(runv2, "getService").rejects({ status: 404 });
  });

  afterEach(() => sinon.restore());

  it("does nothing if no services are being deployed", async () => {
    const payload: Payload = {};
    await prepare({ projectId: "p" }, { config: { src: {} } } as unknown as Options, payload);
    expect(prereqsStub).not.to.have.been.called;
    expect(payload.run).to.be.undefined;
  });

  it("requires a region", async () => {
    await expect(prepareOne({ region: undefined })).to.be.rejectedWith(
      "Cloud Run service s is missing a region in firebase.json.",
    );
  });

  it("reads the service", async () => {
    const svc = await prepareOne();
    expect(prereqsStub).to.have.been.calledWith("p");
    expect(getServiceStub).to.have.been.calledWith("p", "us-central1", "s");
    expect(svc.existing).to.be.undefined;
    expect(svc.baseImage).to.be.undefined;
  });

  it("reuses the service's current base image", async () => {
    getServiceStub.resolves(existing);
    const svc = await prepareOne();
    expect(svc.existing).to.equal(existing);
    expect(svc.baseImage).to.equal(nodejs22);
  });

  it("lets the context set or clear the base image", async () => {
    getServiceStub.resolves(existing);
    expect((await prepareOne({}, { baseImage: "nodejs20" })).baseImage).to.equal("nodejs20");
    expect((await prepareOne({}, { baseImage: null })).baseImage).to.be.undefined;
  });

  it("only prepares the services that --only selects", async () => {
    const payload: Payload = {};
    const sameIdTwoRegions = {
      only: "run:s:europe-west1",
      config: {
        src: {
          run: [
            { serviceId: "s", region: "us-central1" },
            { serviceId: "s", region: "europe-west1" },
          ],
        },
        projectDir: "/p",
      },
    } as unknown as Options;

    await prepare({ projectId: "p" }, sameIdTwoRegions, payload);

    expect(payload.run!.services.map((svc) => svc.config.region)).to.deep.equal(["europe-west1"]);
    expect(getServiceStub).to.have.been.calledOnceWith("p", "europe-west1", "s");
  });
});
