/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
