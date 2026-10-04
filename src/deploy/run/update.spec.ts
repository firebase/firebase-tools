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

  function options(opts: Record<string, unknown> = {}, run: Record<string, unknown> = {}): Options {
    return {
      project: "p",
      config: { src: { run: { serviceId: "s", region: "us-central1", ...run } } },
      ...opts,
    } as unknown as Options;
  }

  beforeEach(() => {
    getServiceStub = sinon.stub(runv2, "getService").resolves(service);
    deployStub = sinon.stub(deployIndex, "deploy").resolves();
  });

  afterEach(() => sinon.restore());

  it("requires exactly one setting", async () => {
    await expect(updateService("s", options())).to.be.rejectedWith(
      "--base-image <baseImage> or --clear-base-image",
    );
    const both = options({ baseImage: "nodejs20", clearBaseImage: true });
    await expect(updateService("s", both)).to.be.rejectedWith("not both");
  });

  it("requires the service to be in firebase.json with a region", async () => {
    await expect(updateService("other", options({ baseImage: "nodejs20" }))).to.be.rejectedWith(
      "Cloud Run service IDs other not detected in firebase.json",
    );
    await expect(
      updateService("s", options({ baseImage: "nodejs20" }, { region: "" })),
    ).to.be.rejectedWith("Cloud Run service s is missing a region in firebase.json.");
  });

  it("requires the service to exist", async () => {
    getServiceStub.rejects({ status: 404 });
    await expect(updateService("s", options({ baseImage: "nodejs22" }))).to.be.rejectedWith(
      /service s doesn't exist in us-central1 yet.*firebase deploy --only run:s/,
    );
    expect(deployStub).not.to.have.been.called;
  });

  it("builds and deploys the service with the new base image", async () => {
    await updateService("s", options({ baseImage: "nodejs20" }));
    expect(deployStub).to.have.been.calledOnceWith(["run"], sinon.match({ only: "run:s" }), {
      baseImage: "nodejs20",
    });
  });

  it("builds and deploys the service without a base image when clearing it", async () => {
    await updateService("s", options({ clearBaseImage: true }));
    expect(deployStub).to.have.been.calledOnceWith(["run"], sinon.match({ only: "run:s" }), {
      baseImage: null,
    });
  });

  it("can't clear the base image of a locally built service", async () => {
    const opts = options({ clearBaseImage: true }, { localBuild: true });
    await expect(updateService("s", opts)).to.be.rejectedWith("local builds need one");
  });

  it("still rebuilds and deploys when clearing a base image that isn't set", async () => {
    getServiceStub.resolves({ ...service, template: { containers: [{ name: "s", image: "i" }] } });
    await updateService("s", options({ clearBaseImage: true }));
    expect(deployStub).to.have.been.calledOnceWith(["run"], sinon.match({ only: "run:s" }), {
      baseImage: null,
    });
  });
});
