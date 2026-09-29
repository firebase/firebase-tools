import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { setBaseImage } from "./baseImage";

describe("setBaseImage", () => {
  const abiuService = {
    name: "projects/p/locations/us-central1/services/s",
    template: {
      revision: "s-1",
      containers: [{ name: "s", image: "i", baseImageUri: "nodejs22" }],
    },
    trafficStatuses: [
      { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", revision: "s-1", percent: 100 },
    ],
  } as unknown as runv2.Service;
  const pinnedTraffic = [
    {
      type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
      revision: "s-1",
      percent: 100,
      tag: undefined,
    },
  ];
  let getServiceStub: sinon.SinonStub;
  let updateServiceStub: sinon.SinonStub;

  function options(opts: Record<string, unknown> = {}, run: Record<string, unknown> = {}) {
    return {
      project: "p",
      service: "s",
      config: { src: { run: { serviceId: "s", region: "us-central1", ...run } } },
      ...opts,
    } as unknown as Options;
  }

  beforeEach(() => {
    getServiceStub = sinon.stub(runv2, "getService").resolves(abiuService);
    updateServiceStub = sinon.stub(runv2, "updateService").resolves();
  });

  afterEach(() => sinon.restore());

  it("requires --service", async () => {
    await expect(setBaseImage(options({ service: undefined }), "nodejs20")).to.be.rejectedWith(
      "--service",
    );
  });

  it("requires the service to be in firebase.json", async () => {
    await expect(setBaseImage(options({ service: "other" }), "nodejs20")).to.be.rejectedWith(
      "Cloud Run service IDs other not detected in firebase.json",
    );
  });

  it("requires the service to be deployed", async () => {
    getServiceStub.rejects({ status: 404 });
    await expect(setBaseImage(options(), "nodejs22")).to.be.rejectedWith(
      /service s doesn't exist in us-central1 yet.*firebase deploy --only run:s/,
    );
    // Local builds can't be deployed without a base image, so only init can create them.
    const localBuild = setBaseImage(options({}, { localBuild: true }), "nodejs22");
    await expect(localBuild).to.be.rejectedWith(
      /firebase init run.*which also sets the base image/,
    );
    expect(updateServiceStub).not.to.have.been.called;
  });

  it("sets the base image without building or sending traffic", async () => {
    await setBaseImage(options(), "nodejs20");

    const [update, updateOpts] = updateServiceStub.firstCall.args;
    expect(updateOpts.updateMask).to.deep.equal(["template", "traffic"]);
    expect(update.template).to.deep.equal({
      containers: [{ name: "s", image: "i", baseImageUri: "nodejs20" }],
    });
    expect(update.traffic).to.deep.equal(pinnedTraffic);
  });

  it("clears the base image without building or sending traffic", async () => {
    await setBaseImage(options(), null);

    const [update] = updateServiceStub.firstCall.args;
    expect(update.template).to.deep.equal({ containers: [{ name: "s", image: "i" }] });
    expect(update.traffic).to.deep.equal(pinnedTraffic);
  });

  it("can't clear the base image of a locally built service", async () => {
    await expect(setBaseImage(options({}, { localBuild: true }), null)).to.be.rejectedWith(
      "local builds need one",
    );
  });

  it("does nothing when clearing a base image that isn't set", async () => {
    getServiceStub.resolves({
      ...abiuService,
      template: { containers: [{ name: "s", image: "i" }] },
    });
    await setBaseImage(options(), null);
    expect(updateServiceStub).not.to.have.been.called;
  });
});
