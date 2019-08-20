import * as _ from "lodash";
import { expect } from "chai";
import * as nock from "nock";
import * as api from "../../api";
import { FirebaseError } from "../../error";

import * as modsApi from "../../extensions/modsApi";

const VERSION = "v1beta1";

const TEST_INSTANCE_1 = {
  name: "projects/invader-zim/instances/image-resizer-1",
  createTime: "2019-06-19T00:20:10.416947Z",
  updateTime: "2019-06-19T00:21:06.722782Z",
  state: "ACTIVE",
  configuration: {
    name:
      "projects/invader-zim/instances/image-resizer-1/configurations/5b1fb749-764d-4bd1-af60-bb7f22d27860",
    createTime: "2019-06-19T00:21:06.722782Z",
  },
};

const TEST_INSTANCE_2 = {
  name: "projects/invader-zim/instances/image-resizer",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE",
  configuration: {
    name:
      "projects/invader-zim/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
  },
};

const TEST_INSTANCES_RESPONSE = {
  instances: [TEST_INSTANCE_1, TEST_INSTANCE_2],
};

const TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN: any = _.cloneDeep(TEST_INSTANCES_RESPONSE);
TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN.nextPageToken = "abc123";

const PROJECT_ID = "test-project";
const INSTANCE_ID = "test-mods-instance";

describe("mods", () => {
  describe("listInstances", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should return a list of installed mods instances", async () => {
      nock(api.modsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query(true) // Internal bug ref: 135750628
        .reply(200, TEST_INSTANCES_RESPONSE);

      const instances = await modsApi.listInstances(PROJECT_ID);

      expect(instances).to.deep.equal(TEST_INSTANCES_RESPONSE.instances);
      expect(nock.isDone()).to.be.true;
    });

    it("should query for more installed mods if the response has a next_page_token", async () => {
      nock(api.modsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query(true) // Internal bug ref: 135750628
        .reply(200, TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN);
      nock(api.modsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query((queryParams: any) => {
          return queryParams.pageToken === "abc123";
        })
        .reply(200, TEST_INSTANCES_RESPONSE);

      const instances = await modsApi.listInstances(PROJECT_ID);

      const expected = TEST_INSTANCES_RESPONSE.instances.concat(
        TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN.instances
      );
      expect(instances).to.deep.equal(expected);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw FirebaseError if any call returns an error", async () => {
      nock(api.modsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query(true)
        .reply(200, TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN);
      nock(api.modsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query((queryParams: any) => {
          return queryParams.pageToken === "abc123";
        })
        .reply(503);

      await expect(modsApi.listInstances(PROJECT_ID)).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("createInstance", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a POST call to the correct endpoint, and then poll on the returned operation", async () => {
      nock(api.modsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .reply(200, { name: "operations/abc123" });
      nock(api.modsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await modsApi.createInstance(
        PROJECT_ID,
        INSTANCE_ID,
        {
          name: "sources/blah",
          packageUri: "https://test.fake/pacakge.zip",
          hash: "abc123",
          spec: { name: "", sourceUrl: "", roles: [], resources: [], params: [] },
        },
        {},
        "my-service-account@proj.gserviceaccount.com"
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if create returns an error response", async () => {
      nock(api.modsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .reply(500);

      await expect(
        modsApi.createInstance(
          PROJECT_ID,
          INSTANCE_ID,
          {
            name: "sources/blah",
            packageUri: "https://test.fake/pacakge.zip",
            hash: "abc123",
            spec: { name: "", sourceUrl: "", roles: [], resources: [], params: [] },
          },
          {},
          "my-service-account@proj.gserviceaccount.com"
        )
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500, Unknown Error");
      expect(nock.isDone()).to.be.true;
    });

    it("stop polling and throw if the operation call throws an unexpected error", async () => {
      nock(api.modsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .reply(200, { name: "operations/abc123" });
      nock(api.modsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(502);

      await expect(
        modsApi.createInstance(
          PROJECT_ID,
          INSTANCE_ID,
          {
            name: "sources/blah",
            packageUri: "https://test.fake/pacakge.zip",
            hash: "abc123",
            spec: { name: "", sourceUrl: "", roles: [], resources: [], params: [] },
          },
          {},
          "my-service-account@proj.gserviceaccount.com"
        )
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 502, Unknown Error");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("configureInstance", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a PATCH call to the correct endpoint, and then poll on the returned operation", async () => {
      nock(api.modsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "configuration.params" })
        .reply(200, { name: "operations/abc123" });
      nock(api.modsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: false })
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await modsApi.configureInstance(PROJECT_ID, INSTANCE_ID, { MY_PARAM: "value" });
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if update returns an error response", async () => {
      nock(api.modsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "configuration.params" })
        .reply(500);

      await expect(
        modsApi.configureInstance(PROJECT_ID, INSTANCE_ID, { MY_PARAM: "value" })
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("deleteInstance", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a DELETE call to the correct endpoint, and then poll on the returned operation", async () => {
      nock(api.modsOrigin)
        .delete(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(200, { name: "operations/abc123" });
      nock(api.modsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await modsApi.deleteInstance(PROJECT_ID, INSTANCE_ID);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if delete returns an error response", async () => {
      nock(api.modsOrigin)
        .delete(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(404);

      await expect(modsApi.deleteInstance(PROJECT_ID, INSTANCE_ID)).to.be.rejectedWith(
        FirebaseError
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getInstance", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a GET call to the correct endpoint", async () => {
      nock(api.modsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(200);

      const res = await modsApi.getInstance(PROJECT_ID, INSTANCE_ID);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the endpoint returns an error response", async () => {
      nock(api.modsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(404);

      await expect(modsApi.getInstance(PROJECT_ID, INSTANCE_ID)).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });
  });
});
