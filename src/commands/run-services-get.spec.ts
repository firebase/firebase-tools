import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseError } from "../error";
import * as run from "../gcp/run";
import * as runv2 from "../gcp/runv2";
import { getServiceSpec } from "./run-services-get";

const SPEC = {
  apiVersion: "serving.knative.dev/v1",
  kind: "Service",
  metadata: { name: "web" },
  spec: {},
} as unknown as run.Service;

function serviceIn(region: string, serviceId: string): runv2.Service {
  return { name: `projects/p/locations/${region}/services/${serviceId}` } as runv2.Service;
}

describe("run:services:get", () => {
  let getService: sinon.SinonStub;
  let listServices: sinon.SinonStub;

  beforeEach(() => {
    getService = sinon.stub(run, "getService").resolves(SPEC);
    listServices = sinon.stub(runv2, "listServices");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("gets the service in the given region without listing services", async () => {
    expect(await getServiceSpec("p", "web", "europe-west1")).to.equal(SPEC);

    expect(getService).to.have.been.calledOnceWithExactly(
      "projects/p/locations/europe-west1/services/web",
    );
    expect(listServices).to.not.have.been.called;
  });

  it("finds the service's region when none is given", async () => {
    listServices.resolves([serviceIn("asia-east1", "web"), serviceIn("us-central1", "api")]);

    expect(await getServiceSpec("p", "web")).to.equal(SPEC);

    expect(listServices).to.have.been.calledOnceWithExactly("p", false);
    expect(getService).to.have.been.calledOnceWithExactly(
      "projects/p/locations/asia-east1/services/web",
    );
  });

  it("throws if no service has the ID", async () => {
    listServices.resolves([serviceIn("us-central1", "api")]);

    await expect(getServiceSpec("p", "web")).to.be.rejectedWith(
      FirebaseError,
      "Cloud Run service web doesn't exist in project p.",
    );
    expect(getService).to.not.have.been.called;
  });

  it("asks for --region if the ID is in more than one region", async () => {
    listServices.resolves([serviceIn("us-central1", "web"), serviceIn("europe-west1", "web")]);

    await expect(getServiceSpec("p", "web")).to.be.rejectedWith(
      FirebaseError,
      "Cloud Run service web exists in more than one region: us-central1, europe-west1. " +
        "Choose one with --region.",
    );
    expect(getService).to.not.have.been.called;
  });

  it("says the service doesn't exist if the region has no service with the ID", async () => {
    getService.rejects(new FirebaseError("Failed to fetch Run service", { status: 404 }));

    await expect(getServiceSpec("p", "web", "europe-west1")).to.be.rejectedWith(
      FirebaseError,
      "Cloud Run service web doesn't exist in europe-west1.",
    );
  });

  it("passes other errors through", async () => {
    getService.rejects(new FirebaseError("Failed to fetch Run service", { status: 403 }));

    await expect(getServiceSpec("p", "web", "europe-west1")).to.be.rejectedWith(
      FirebaseError,
      "Failed to fetch Run service",
    );
  });

  it("rejects an invalid service ID or region without calling Cloud Run", async () => {
    for (const serviceId of ["../web", "web/../api", "Web", "-web", "web-", ""]) {
      await expect(getServiceSpec("p", serviceId, "us-central1")).to.be.rejectedWith(
        FirebaseError,
        "Invalid Cloud Run service ID",
      );
    }
    for (const region of ["us-central1/../x", "US-CENTRAL1", "uscentral1", ""]) {
      await expect(getServiceSpec("p", "web", region)).to.be.rejectedWith(
        FirebaseError,
        "Invalid region",
      );
    }
    expect(getService).to.not.have.been.called;
    expect(listServices).to.not.have.been.called;
  });
});
