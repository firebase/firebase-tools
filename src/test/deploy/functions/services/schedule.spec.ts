import { expect } from "chai";
import { Endpoint } from "../../../../deploy/functions/backend";
import * as schedule from "../../../../deploy/functions/services/schedule";

const projectNumber = "123456789";

const endpoint: Endpoint = {
  id: "endpoint",
  region: "us-central1",
  project: projectNumber,
  scheduleTrigger: {
    retryConfig: {},
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("ensureScheduleTriggerRegion", () => {
  it("should error if the endpoint location is not valid", () => {
    const ep = { ...endpoint, region: "europe-west9" };

    expect(() => schedule.ensureScheduleTriggerRegion(ep)).to.throw(
      `Location europe-west9 is not a valid schedule trigger location`
    );
  });

  it("should not error if the endpoint location is valid", () => {
    const ep = { ...endpoint };

    expect(() => schedule.ensureScheduleTriggerRegion(ep)).to.not.throw();
  });
});
