import * as _ from "lodash";
import { expect } from "chai";
import * as nock from "nock";
import * as api from "../../api";

import { cloudscheduler } from "../../gcp";

const VERSION = "v1beta1";

const testJob = {
  name: "projects/test-project/locations/us-east1/jobs/test",
  schedule: "every 5 minutes",
  timeZone: "America/Los_Angeles",
  httpTarget: {
    uri: "https://afakeone.come",
    httpMethod: "POST",
  },
  retryConfig: {},
};

describe("cloudscheduler", () => {
  describe("createOrUpdateJob", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should create a job if none exists", async () => {
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${testJob.name}`)
        .reply(404, { context: { response: { statusCode: 404 } } });
      const mockJobResp = { schedule: "every 5 minutes" };
      nock(api.cloudschedulerOrigin)
        .post(`/${VERSION}/projects/test-project/locations/us-east1/jobs`)
        .reply(200, mockJobResp);

      const response = await cloudscheduler.createOrReplaceJob(testJob);

      expect(response.body).to.deep.equal(mockJobResp);
      expect(nock.isDone()).to.be.true;
    });

    it("should do nothing if an identical job exists", async () => {
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${testJob.name}`)
        .reply(200, testJob);

      const response = await cloudscheduler.createOrReplaceJob(testJob);

      expect(response).to.be.undefined;
      expect(nock.isDone()).to.be.true;
    });

    it("should update if a job exists with the same name and a different schedule", async () => {
      const otherJob = _.cloneDeep(testJob);
      otherJob.schedule = "every 6 minutes";
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${testJob.name}`)
        .reply(200, otherJob);
      const mockJobResp = { schedule: "every 6 minutes" };
      nock(api.cloudschedulerOrigin)
        .patch(`/${VERSION}/${testJob.name}`)
        .reply(200, mockJobResp);

      const response = await cloudscheduler.createOrReplaceJob(testJob);

      expect(response.body).to.deep.equal(mockJobResp);
      expect(nock.isDone()).to.be.true;
    });

    it("should update if a job exists with the same name but a different timeZone", async () => {
      const otherJob = _.cloneDeep(testJob);
      otherJob.timeZone = "America/New_York";
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${testJob.name}`)
        .reply(200, otherJob);
      const mockJobResp = { timeZone: "America/New_York" };
      nock(api.cloudschedulerOrigin)
        .patch(`/${VERSION}/${testJob.name}`)
        .reply(200, mockJobResp);

      const response = await cloudscheduler.createOrReplaceJob(testJob);

      expect(response.body).to.deep.equal(mockJobResp);
      expect(nock.isDone()).to.be.true;
    });

    it("should update if a job exists with the same name but a different schedule", async () => {
      const otherJob = _.cloneDeep(testJob);
      otherJob.retryConfig = { maxDoublings: 10 };
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${testJob.name}`)
        .reply(200, otherJob);
      const mockJobResp = { retryConfig: { maxDoublings: 10 } };
      nock(api.cloudschedulerOrigin)
        .patch(`/${VERSION}/${testJob.name}`)
        .reply(200, mockJobResp);

      const response = await cloudscheduler.createOrReplaceJob(testJob);

      expect(response.body).to.deep.equal(mockJobResp);
      expect(nock.isDone()).to.be.true;
    });
  });
});
