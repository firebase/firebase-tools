import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { Context, Payload, ServiceDeploy } from "./args";
import { prepare } from "./prepare";
import * as prereqs from "./prereqs";

describe("run prepare", () => {
  const nodejs22 = "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22";
  const web = { serviceId: "web", region: "us-central1" };
  const liveWeb = {
    name: "projects/my-project/locations/us-central1/services/web",
    template: { containers: [{ name: "web", image: "old-image", baseImageUri: nodejs22 }] },
  } as unknown as runv2.Service;
  let prereqsStub: sinon.SinonStub;
  let getServiceStub: sinon.SinonStub;

  /** Runs prepare on a firebase.json "run" config and returns the services it will deploy. */
  async function prepareRun(
    run: unknown,
    { context = {}, only }: { context?: Partial<Context>; only?: string } = {},
  ): Promise<ServiceDeploy[]> {
    const options = {
      config: { src: { run }, projectDir: "/project" },
      only,
    } as unknown as Options;
    const payload: Payload = {};
    await prepare({ projectId: "my-project", ...context }, options, payload);
    return payload.run?.services ?? [];
  }

  beforeEach(() => {
    prereqsStub = sinon.stub(prereqs, "prereqs").resolves();
    getServiceStub = sinon.stub(runv2, "getService").rejects({ status: 404 });
  });

  afterEach(() => sinon.restore());

  it("does nothing if firebase.json has no Cloud Run services", async () => {
    expect(await prepareRun(undefined)).to.deep.equal([]);
    expect(prereqsStub).not.to.have.been.called;
  });

  it("checks the APIs and finds that a new service doesn't exist yet", async () => {
    expect(await prepareRun(web)).to.deep.equal([
      { config: web, existing: undefined, baseImage: undefined },
    ]);
    expect(prereqsStub).to.have.been.calledWith("my-project");
    expect(getServiceStub).to.have.been.calledWith("my-project", "us-central1", "web");
  });

  it("reuses an existing service's base image", async () => {
    getServiceStub.resolves(liveWeb);
    expect(await prepareRun(web)).to.deep.equal([
      { config: web, existing: liveWeb, baseImage: nodejs22 },
    ]);
  });

  it("lets the context set or clear the base image", async () => {
    getServiceStub.resolves(liveWeb);
    const [withNewImage] = await prepareRun(web, { context: { baseImage: "nodejs24" } });
    expect(withNewImage.baseImage).to.equal("nodejs24");
    const [cleared] = await prepareRun(web, { context: { baseImage: null } });
    expect(cleared.baseImage).to.be.undefined;
  });

  it("only prepares the services that --only selects", async () => {
    const webEurope = { serviceId: "web", region: "europe-west1" };
    const services = await prepareRun([web, webEurope], { only: "run:web:europe-west1" });
    expect(services.map((svc) => svc.config)).to.deep.equal([webEurope]);
    expect(getServiceStub).to.have.been.calledOnceWith("my-project", "europe-west1", "web");
  });
});
