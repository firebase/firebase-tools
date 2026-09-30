import { expect } from "chai";
import * as sinon from "sinon";
import * as deployIndex from "..";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { updateService } from "./update";

describe("updateService", () => {
  const service = {
    name: "projects/p/locations/us-central1/services/s",
    template: { containers: [{ name: "s", image: "i", baseImageUri: "nodejs22" }] },
  } as unknown as runv2.Service;
  let getServiceStub: sinon.SinonStub;
  let deployStub: sinon.SinonStub;

  function options(opts: Record<string, unknown> = {}, run: Record<string, unknown> = {}) {
    return {
      project: "p",
      service: "s",
      config: { src: { run: { serviceId: "s", region: "us-central1", ...run } } },
      ...opts,
    } as unknown as Options;
  }

  beforeEach(() => {
    getServiceStub = sinon.stub(runv2, "getService").resolves(service);
    deployStub = sinon.stub(deployIndex, "deploy").resolves();
  });

  afterEach(() => sinon.restore());

  it("requires --service", async () => {
    const opts = options({ service: undefined, baseImage: "nodejs20" });
    await expect(updateService(opts)).to.be.rejectedWith("--service");
  });

  it("requires at least one valid setting", async () => {
    await expect(updateService(options())).to.be.rejectedWith(
      "--base-image <baseImage>, --clear-base-image, --app <appId>, or --clear-app",
    );
    const bothBase = options({ baseImage: "nodejs20", clearBaseImage: true });
    await expect(updateService(bothBase)).to.be.rejectedWith("not both");
    const bothApp = options({ app: "app-1", clearApp: true });
    await expect(updateService(bothApp)).to.be.rejectedWith("not both");
  });

  it("requires the service to be in firebase.json", async () => {
    const opts = options({ service: "other", baseImage: "nodejs20" });
    await expect(updateService(opts)).to.be.rejectedWith(
      "Cloud Run service IDs other not detected in firebase.json",
    );
  });

  it("requires the service to exist", async () => {
    getServiceStub.rejects({ status: 404 });
    await expect(updateService(options({ baseImage: "nodejs22" }))).to.be.rejectedWith(
      /service s doesn't exist in us-central1 yet.*firebase deploy --only run:s/,
    );
    expect(deployStub).not.to.have.been.called;
  });

  it("builds and deploys the service with the new base image", async () => {
    await updateService(options({ baseImage: "nodejs20" }));
    expect(deployStub).to.have.been.calledOnceWith(["run"], sinon.match({ only: "run:s" }), {
      baseImage: "nodejs20",
    });
  });

  it("builds and deploys the service without a base image when clearing it", async () => {
    await updateService(options({ clearBaseImage: true }));
    expect(deployStub).to.have.been.calledOnceWith(["run"], sinon.match({ only: "run:s" }), {
      baseImage: null,
    });
  });

  it("can't clear the base image of a locally built service", async () => {
    const opts = options({ clearBaseImage: true }, { localBuild: true });
    await expect(updateService(opts)).to.be.rejectedWith("local builds need one");
  });

  it("does nothing when clearing a base image that isn't set", async () => {
    getServiceStub.resolves({ ...service, template: { containers: [{ name: "s", image: "i" }] } });
    await updateService(options({ clearBaseImage: true }));
    expect(deployStub).not.to.have.been.called;
  });

  it("links and clears a Firebase Web App", async () => {
    await updateService(options({ app: "1:1:web:a" }));
    expect(deployStub).to.have.been.calledOnceWith(["run"], sinon.match({ only: "run:s" }), {
      appId: "1:1:web:a",
    });

    getServiceStub.resolves({ ...service, annotations: { "firebase.google.com/app-id": "1:1:web:a" } });
    await updateService(options({ clearApp: true }));
    expect(deployStub).to.have.been.calledWith(["run"], sinon.match({ only: "run:s" }), {
      appId: null,
    });
  });

  it("does nothing when clearing an app that isn't linked", async () => {
    await updateService(options({ clearApp: true }));
    expect(deployStub).not.to.have.been.called;
  });
});
