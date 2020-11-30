import { expect } from "chai";
import * as _ from "lodash";
import * as nock from "nock";

import { cloudscheduler } from "../../gcp";
import { FirebaseError } from "../../error";
import * as api from "../../api";

const VERSION = "v1beta1";

const TEST_JOB = {
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
        .get(`/${VERSION}/${TEST_JOB.name}`)
        .reply(404, { context: { response: { statusCode: 404 } } });
      nock(api.cloudschedulerOrigin)
        .post(`/${VERSION}/projects/test-project/locations/us-east1/jobs`)
        .reply(200, TEST_JOB);

      const response = await cloudscheduler.createOrReplaceJob(TEST_JOB);

      expect(response.body).to.deep.equal(TEST_JOB);
      expect(nock.isDone()).to.be.true;
    });

    it("should do nothing if a functionally identical job exists", async () => {
      const otherJob = _.cloneDeep(TEST_JOB);
      otherJob.name = "something-different";
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${TEST_JOB.name}`)
        .reply(200, otherJob);

      const response = await cloudscheduler.createOrReplaceJob(TEST_JOB);

      expect(response).to.be.undefined;
      expect(nock.isDone()).to.be.true;
    });

    it("should update if a job exists with the same name and a different schedule", async () => {
      const otherJob = _.cloneDeep(TEST_JOB);
      otherJob.schedule = "every 6 minutes";
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${TEST_JOB.name}`)
        .reply(200, otherJob);
      nock(api.cloudschedulerOrigin)
        .patch(`/${VERSION}/${TEST_JOB.name}`)
        .reply(200, otherJob);

      const response = await cloudscheduler.createOrReplaceJob(TEST_JOB);

      expect(response.body).to.deep.equal(otherJob);
      expect(nock.isDone()).to.be.true;
    });

    it("should update if a job exists with the same name but a different timeZone", async () => {
      const otherJob = _.cloneDeep(TEST_JOB);
      otherJob.timeZone = "America/New_York";
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${TEST_JOB.name}`)
        .reply(200, otherJob);
      nock(api.cloudschedulerOrigin)
        .patch(`/${VERSION}/${TEST_JOB.name}`)
        .reply(200, otherJob);

      const response = await cloudscheduler.createOrReplaceJob(TEST_JOB);

      expect(response.body).to.deep.equal(otherJob);
      expect(nock.isDone()).to.be.true;
    });

    it("should update if a job exists with the same name but a different retry config", async () => {
      const otherJob = _.cloneDeep(TEST_JOB);
      otherJob.retryConfig = { maxDoublings: 10 };
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${TEST_JOB.name}`)
        .reply(200, otherJob);
      nock(api.cloudschedulerOrigin)
        .patch(`/${VERSION}/${TEST_JOB.name}`)
        .reply(200, otherJob);

      const response = await cloudscheduler.createOrReplaceJob(TEST_JOB);

      expect(response.body).to.deep.equal(otherJob);
      expect(nock.isDone()).to.be.true;
    });

    it("should error and exit if cloud resource location is not set", async () => {
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${TEST_JOB.name}`)
        .reply(404, { context: { response: { statusCode: 404 } } });
      nock(api.cloudschedulerOrigin)
        .post(`/${VERSION}/projects/test-project/locations/us-east1/jobs`)
        .reply(404, { context: { response: { statusCode: 404 } } });

      await expect(cloudscheduler.createOrReplaceJob(TEST_JOB)).to.be.rejectedWith(
        FirebaseError,
        "Cloud resource location is not set"
      );

      expect(nock.isDone()).to.be.true;
    });

    it("should error and exit if cloud scheduler create request fail", async () => {
      nock(api.cloudschedulerOrigin)
        .get(`/${VERSION}/${TEST_JOB.name}`)
        .reply(404, { context: { response: { statusCode: 404 } } });
      nock(api.cloudschedulerOrigin)
        .post(`/${VERSION}/projects/test-project/locations/us-east1/jobs`)
        .reply(400, { context: { response: { statusCode: 400 } } });

      await expect(cloudscheduler.createOrReplaceJob(TEST_JOB)).to.be.rejectedWith(
        FirebaseError,
        "Failed to create scheduler job projects/test-project/locations/us-east1/jobs/test: HTTP Error: 400, Unknown Error"
      );

      expect(nock.isDone()).to.be.true;
    });
  });
});
