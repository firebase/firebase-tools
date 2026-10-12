import { expect } from "chai";
import * as sinon from "sinon";
import * as deployIndex from "..";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { updateService } from "./update";

describe("updateService", () => {
  const web = { serviceId: "web", region: "us-central1" };
  const webEurope = { serviceId: "web", region: "europe-west1" };
  let getServiceStub: sinon.SinonStub;
  let deployStub: sinon.SinonStub;

  beforeEach(() => {
    getServiceStub = sinon.stub(runv2, "getService").resolves({
      name: "projects/my-project/locations/us-central1/services/web",
    } as runv2.Service);
    deployStub = sinon.stub(deployIndex, "deploy").resolves();
  });

  afterEach(() => sinon.restore());

  /** Runs `firebase run:services:update <serviceId>` with these flags and firebase.json "run" config. */
  function update(
    serviceId: string,
    flags: Record<string, unknown>,
    run: unknown = web,
  ): Promise<void> {
    const options = { project: "my-project", config: { src: { run } }, ...flags };
    return updateService(
      serviceId,
      flags.region as string | undefined,
      options as unknown as Options,
    );
  }

  /** Asserts that update deployed only `only`, with these settings. */
  function expectDeployed(only: string, settings: Record<string, unknown>): void {
    expect(deployStub).to.have.been.calledOnceWith(
      ["run"],
      sinon.match({ only }),
      sinon.match(settings),
    );
  }

  it("requires --base-image or --clear-base-image, but not both", async () => {
    await expect(update("web", {})).to.be.rejectedWith(
      "--base-image <baseImage> or --clear-base-image",
    );
    await expect(update("web", { baseImage: "nodejs22", clearBaseImage: true })).to.be.rejectedWith(
      "Use either --base-image or --clear-base-image, not both.",
    );
  });

  it("requires the service to be in firebase.json", async () => {
    await expect(update("api", { baseImage: "nodejs22" })).to.be.rejectedWith(
      "Cloud Run service api not detected in firebase.json.",
    );
    await expect(
      update("web", { region: "europe-west1", baseImage: "nodejs22" }),
    ).to.be.rejectedWith("Cloud Run service web in europe-west1 not detected in firebase.json.");
  });

  it("requires the service to exist", async () => {
    getServiceStub.rejects({ status: 404 });

    await expect(update("web", { baseImage: "nodejs22" })).to.be.rejectedWith(
      /web doesn't exist in us-central1 yet.*firebase deploy --only run:web:us-central1/,
    );
    expect(deployStub).not.to.have.been.called;
  });

  it("deploys the service with the new base image", async () => {
    await update("web", { baseImage: "nodejs22" });

    expectDeployed("run:web:us-central1", { baseImage: "nodejs22" });
  });

  it("clears the base image, and deploys even if there's none to clear", async () => {
    await update("web", { clearBaseImage: true });

    expectDeployed("run:web:us-central1", { baseImage: null });
  });

  describe("for a locally built service", () => {
    const localWeb = { ...web, localBuild: true };

    it("refuses to clear its base image, which local builds need", async () => {
      await expect(update("web", { clearBaseImage: true }, localWeb)).to.be.rejectedWith(
        "Cannot clear the base image of web: local builds need one.",
      );
    });

    it("says to create it with init, which sets a base image", async () => {
      getServiceStub.rejects({ status: 404 });

      await expect(update("web", { baseImage: "nodejs22" }, localWeb)).to.be.rejectedWith(
        /doesn't exist in us-central1 yet\. Create it with \S*firebase init run\S*, then update it\./,
      );
    });
  });

  describe("when firebase.json lists the service in two regions", () => {
    it("asks which one to update", async () => {
      await expect(update("web", { baseImage: "nodejs22" }, [web, webEurope])).to.be.rejectedWith(
        "firebase.json lists web in 2 regions: us-central1, europe-west1. " +
          "Pick one with --region, e.g. firebase run:services:update web --region us-central1",
      );
      expect(deployStub).not.to.have.been.called;
    });

    it("updates only the region it's given", async () => {
      await update("web", { region: "europe-west1", baseImage: "nodejs22" }, [web, webEurope]);

      expect(getServiceStub).to.have.been.calledOnceWith("my-project", "europe-west1", "web");
      expectDeployed("run:web:europe-west1", { baseImage: "nodejs22" });
    });
  });
});
