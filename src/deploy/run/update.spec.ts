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
      "Cloud Run service other not detected in firebase.json.",
    );
    await expect(
      updateService("s:us-east1", options({ baseImage: "nodejs20" })),
    ).to.be.rejectedWith("Cloud Run service s:us-east1 not detected in firebase.json.");
    await expect(
      updateService("s", options({ baseImage: "nodejs20" }, { region: "" })),
    ).to.be.rejectedWith("Cloud Run service s is missing a region in firebase.json.");
  });

  it("requires the service to exist", async () => {
    getServiceStub.rejects({ status: 404 });
    await expect(updateService("s", options({ baseImage: "nodejs22" }))).to.be.rejectedWith(
      /service s doesn't exist in us-central1 yet.*firebase deploy --only run:s:us-central1/,
    );
    expect(deployStub).not.to.have.been.called;
  });

  it("builds and deploys the service with the new base image", async () => {
    await updateService("s", options({ baseImage: "nodejs20" }));
    expect(deployStub).to.have.been.calledOnceWith(
      ["run"],
      sinon.match({ only: "run:s:us-central1" }),
      { baseImage: "nodejs20" },
    );
  });

  it("builds and deploys the service without a base image when clearing it", async () => {
    await updateService("s", options({ clearBaseImage: true }));
    expect(deployStub).to.have.been.calledOnceWith(
      ["run"],
      sinon.match({ only: "run:s:us-central1" }),
      { baseImage: null },
    );
  });

  it("can't clear the base image of a locally built service", async () => {
    const opts = options({ clearBaseImage: true }, { localBuild: true });
    await expect(updateService("s", opts)).to.be.rejectedWith("local builds need one");
  });

  it("still rebuilds and deploys when clearing a base image that isn't set", async () => {
    getServiceStub.resolves({ ...service, template: { containers: [{ name: "s", image: "i" }] } });
    await updateService("s", options({ clearBaseImage: true }));
    expect(deployStub).to.have.been.calledOnceWith(
      ["run"],
      sinon.match({ only: "run:s:us-central1" }),
      { baseImage: null },
    );
  });

  describe("when firebase.json lists the service ID more than once", () => {
    const twoRegions = {
      src: {
        run: [
          { serviceId: "s", region: "us-central1" },
          { serviceId: "s", region: "europe-west1" },
        ],
      },
    };

    it("asks for the region", async () => {
      await expect(
        updateService("s", options({ baseImage: "nodejs20", config: twoRegions })),
      ).to.be.rejectedWith(
        "s matches 2 services in firebase.json: s:us-central1, s:europe-west1. " +
          "Run the command again with one of them, e.g. firebase run:services:update s:us-central1",
      );
      expect(deployStub).not.to.have.been.called;
    });

    it("updates only the region it's given", async () => {
      await updateService("s:europe-west1", options({ baseImage: "nodejs20", config: twoRegions }));
      expect(getServiceStub).to.have.been.calledOnceWith("p", "europe-west1", "s");
      expect(deployStub).to.have.been.calledOnceWith(
        ["run"],
        sinon.match({ only: "run:s:europe-west1" }),
        { baseImage: "nodejs20" },
      );
    });

    it("reports a missing region instead of listing the matches", async () => {
      const noRegion = {
        src: { run: [{ serviceId: "s" }, { serviceId: "s", region: "us-central1" }] },
      };
      await expect(
        updateService("s", options({ baseImage: "nodejs20", config: noRegion })),
      ).to.be.rejectedWith("Cloud Run service s is missing a region in firebase.json.");
    });
  });
});
