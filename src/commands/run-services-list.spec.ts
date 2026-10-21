import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../gcp/runv2";
import { logger } from "../logger";
import * as utils from "../utils";
import { listRunServices } from "./run-services-list";

const WEB = {
  name: "projects/p/locations/us-central1/services/web",
  template: {
    containers: [
      {
        image: "web-image",
        baseImageUri: "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22",
      },
    ],
  },
} as runv2.Service;
const API = {
  name: "projects/p/locations/europe-west1/services/api",
  template: { containers: [{ image: "api-image" }] },
} as runv2.Service;
const FUNCTION = {
  name: "projects/p/locations/us-central1/services/fn",
  labels: { [runv2.CLIENT_NAME_LABEL]: "cloudfunctions" },
  template: { containers: [{ image: "fn-image" }] },
} as unknown as runv2.Service;

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

  it("lists each service's ID, region, and base image, sorted by ID", async () => {
    listServices.resolves([WEB, API]);

    const services = await listRunServices("p");

    expect(listServices).to.have.been.calledOnceWithExactly("p", false);
    expect(services).to.deep.equal([WEB, API]);
    const table = loggerInfo.firstCall.args[0] as string;
    for (const text of ["web", "us-central1", "nodejs22", "api", "europe-west1", "None"]) {
      expect(table).to.include(text);
    }
    // The base image shows as the name users pass to --base-image, not the full URI.
    expect(table).to.not.include("serverless-runtimes");
    expect(table.indexOf("api")).to.be.lessThan(table.indexOf("web"));
    expect(logBullet).to.not.have.been.called;
  });

  it("leaves out services that another product manages, and says how many", async () => {
    listServices.resolves([WEB, FUNCTION]);

    const services = await listRunServices("p");

    expect(services).to.deep.equal([WEB]);
    expect(loggerInfo.firstCall.args[0]).to.not.include("fn");
    expect(logBullet).to.have.been.calledOnceWith(sinon.match("1 service that another product"));
  });

  it("says when the project has no services", async () => {
    listServices.resolves([]);

    const services = await listRunServices("p");

    expect(services).to.deep.equal([]);
    expect(loggerInfo).to.have.been.calledOnceWithExactly(
      "No Cloud Run services found in project p.",
    );
    expect(logBullet).to.not.have.been.called;
  });
});
