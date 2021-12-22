import { expect } from "chai";
import * as nock from "nock";
import * as api from "../../api";
import { FirebaseError } from "../../error";
import { Aligner, CmQuery, queryTimeSeries, TimeSeriesView } from "../../gcp/cloudmonitoring";

const CLOUD_MONITORING_VERSION = "v3";
const PROJECT_NUMBER = 1;

describe("queryTimeSeries", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const query: CmQuery = {
    filter:
      'metric.type="firebaseextensions.googleapis.com/extension/version/active_instances" resource.type="firebaseextensions.googleapis.com/ExtensionVersion"',
    "interval.endTime": new Date().toJSON(),
    "interval.startTime": new Date().toJSON(),
    view: TimeSeriesView.FULL,
    "aggregation.alignmentPeriod": (60 * 60 * 24).toString() + "s",
    "aggregation.perSeriesAligner": Aligner.ALIGN_MAX,
  };

  const RESPONSE = {
    timeSeries: [],
  };

  it("should make a POST call to the correct endpoint", async () => {
    nock(api.cloudMonitoringOrigin)
      .get(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_NUMBER}/timeSeries/`)
      .query(true)
      .reply(200, RESPONSE);

    const res = await queryTimeSeries(query, PROJECT_NUMBER);
    expect(res).to.deep.equal(RESPONSE.timeSeries);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.cloudMonitoringOrigin)
      .get(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_NUMBER}/timeSeries/`)
      .query(true)
      .reply(404);
    await expect(queryTimeSeries(query, PROJECT_NUMBER)).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});
