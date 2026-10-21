import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../gcp/runv2";
import { logger } from "../logger";
import * as utils from "../utils";
import { listRunServices, serviceRows } from "./run-services-list";

function service(region: string, serviceId: string, baseImageUri?: string): runv2.Service {
  return {
    name: `projects/p/locations/${region}/services/${serviceId}`,
    template: { containers: [{ image: "image", baseImageUri }] },
  } as runv2.Service;
}

const WEB = service(
  "us-central1",
  "web",
  "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22",
);
const API = service("europe-west1", "api");
const FUNCTION = {
  ...service("us-central1", "fn"),
  labels: { "goog-managed-by": "cloudfunctions" },
};

describe("run:services:list", () => {
  let listServices: sinon.SinonStub;
  let loggerInfo: sinon.SinonStub;
  let logBullet: sinon.SinonStub;

  beforeEach(() => {
    listServices = sinon.stub(runv2, "listServices");
    loggerInfo = sinon.stub(logger, "info");
    logBullet = sinon.stub(utils, "logBullet");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("shows each service's ID, region, and short base image name, sorted by ID", () => {
    expect(serviceRows([WEB, API])).to.deep.equal([
      ["api", "europe-west1", "None"],
      ["web", "us-central1", "nodejs22"],
    ]);
  });

  it("prints and returns the project's services, except ones another product manages", async () => {
    listServices.resolves([WEB, FUNCTION]);

    expect(await listRunServices("p")).to.deep.equal([WEB]);

    expect(listServices).to.have.been.calledOnceWithExactly("p", false);
    expect(loggerInfo.firstCall.args[0]).to.include("web").and.not.include("fn");
    expect(logBullet).to.have.been.calledOnceWith(sinon.match("1 service that another product"));
  });

  it("says when the project has no services", async () => {
    listServices.resolves([]);

    expect(await listRunServices("p")).to.deep.equal([]);

    expect(loggerInfo).to.have.been.calledOnceWithExactly(
      "No Cloud Run services found in project p.",
    );
    expect(logBullet).to.not.have.been.called;
  });
});
