import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseError } from "../error";
import * as run from "../gcp/run";
import * as runv2 from "../gcp/runv2";
import { getServiceSpec } from "./run-services-get";

const SPEC = { kind: "Service" } as run.Service;

function service(region: string, serviceId: string): runv2.Service {
  return { name: `projects/p/locations/${region}/services/${serviceId}` } as runv2.Service;
}

describe("run:services:get", () => {
  let listServices: sinon.SinonStub;
  let getService: sinon.SinonStub;

  beforeEach(() => {
    listServices = sinon
      .stub(runv2, "listServices")
      .resolves([
        service("us-central1", "web"),
        service("us-central1", "api"),
        service("europe-west1", "api"),
      ]);
    getService = sinon.stub(run, "getService").resolves(SPEC);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("gets the service with the ID", async () => {
    expect(await getServiceSpec("p", "web")).to.equal(SPEC);

    expect(listServices).to.have.been.calledOnceWithExactly("p", false);
    expect(getService).to.have.been.calledOnceWithExactly(
      "projects/p/locations/us-central1/services/web",
    );
  });

  it("gets the service in the given region", async () => {
    expect(await getServiceSpec("p", "api", "europe-west1")).to.equal(SPEC);

    expect(getService).to.have.been.calledOnceWithExactly(
      "projects/p/locations/europe-west1/services/api",
    );
  });

  it("asks for --region if the ID is in more than one region", async () => {
    await expect(getServiceSpec("p", "api")).to.be.rejectedWith(
      FirebaseError,
      "Cloud Run service api exists in more than one region: us-central1, europe-west1. " +
        "Choose one with --region.",
    );
  });

  it("throws if there's no service with the ID, in the region if one is given", async () => {
    await expect(getServiceSpec("p", "nope")).to.be.rejectedWith(
      FirebaseError,
      "Cloud Run service nope doesn't exist in project p.",
    );
    await expect(getServiceSpec("p", "web", "europe-west1")).to.be.rejectedWith(
      FirebaseError,
      "Cloud Run service web doesn't exist in europe-west1.",
    );
    expect(getService).to.not.have.been.called;
  });
});
