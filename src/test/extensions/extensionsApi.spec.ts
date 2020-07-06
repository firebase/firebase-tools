import * as _ from "lodash";
import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import * as helpers from "../helpers";
import * as api from "../../api";
import { FirebaseError } from "../../error";

import * as extensionsApi from "../../extensions/extensionsApi";

const VERSION = "v1beta";
const PROJECT_ID = "test-project";
const INSTANCE_ID = "test-extensions-instance";
const PUBLISHER_ID = "test-project";
const EXTENSION_ID = "test-extension";
const EXTENSION_VERSION = "0.0.1";

const EXT_SPEC = {
  name: "cool-things",
  version: "1.0.0",
  resources: {
    name: "cool-resource",
    type: "firebaseextensions.v1beta.function",
  },
  sourceUrl: "www.google.com/cool-things-here",
};

const TEST_EXT_VERSION_3 = {
  name: "publishers/test-pub/extensions/ext-one/versions/0.0.3",
  ref: "test-pub/ext-one@0.0.3",
  spec: EXT_SPEC,
  state: "PUBLISHED",
  hash: "34567",
  createTime: "2020-06-30T00:21:06.722782Z",
};

const TEST_INSTANCE_1 = {
  name: "projects/invader-zim/instances/image-resizer-1",
  createTime: "2019-06-19T00:20:10.416947Z",
  updateTime: "2019-06-19T00:21:06.722782Z",
  state: "ACTIVE",
  config: {
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
  config: {
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

describe("extensions", () => {
  beforeEach(() => {
    helpers.mockAuth(sinon);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("listInstances", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should return a list of installed extensions instances", async () => {
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query((queryParams: any) => {
          return queryParams.pageSize === "100";
        })
        .reply(200, TEST_INSTANCES_RESPONSE);

      const instances = await extensionsApi.listInstances(PROJECT_ID);

      expect(instances).to.deep.equal(TEST_INSTANCES_RESPONSE.instances);
      expect(nock.isDone()).to.be.true;
    });

    it("should query for more installed extensions if the response has a next_page_token", async () => {
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query((queryParams: any) => {
          return queryParams.pageSize === "100";
        })
        .reply(200, TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN);
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query((queryParams: any) => {
          return queryParams.pageToken === "abc123";
        })
        .reply(200, TEST_INSTANCES_RESPONSE);

      const instances = await extensionsApi.listInstances(PROJECT_ID);

      const expected = TEST_INSTANCES_RESPONSE.instances.concat(
        TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN.instances
      );
      expect(instances).to.deep.equal(expected);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw FirebaseError if any call returns an error", async () => {
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query((queryParams: any) => {
          return queryParams.pageSize === "100";
        })
        .reply(200, TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN);
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances`)
        .query((queryParams: any) => {
          return queryParams.pageToken === "abc123";
        })
        .reply(503);

      await expect(extensionsApi.listInstances(PROJECT_ID)).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("createInstance", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a POST call to the correct endpoint, and then poll on the returned operation", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await extensionsApi.createInstance(
        PROJECT_ID,
        INSTANCE_ID,
        {
          name: "sources/blah",
          packageUri: "https://test.fake/pacakge.zip",
          hash: "abc123",
          spec: { name: "", version: "0.1.0", sourceUrl: "", roles: [], resources: [], params: [] },
        },
        {},
        "my-service-account@proj.gserviceaccount.com"
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if create returns an error response", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .reply(500);

      await expect(
        extensionsApi.createInstance(
          PROJECT_ID,
          INSTANCE_ID,
          {
            name: "sources/blah",
            packageUri: "https://test.fake/pacakge.zip",
            hash: "abc123",
            spec: {
              name: "",
              version: "0.1.0",
              sourceUrl: "",
              roles: [],
              resources: [],
              params: [],
            },
          },
          {},
          "my-service-account@proj.gserviceaccount.com"
        )
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500, Unknown Error");
      expect(nock.isDone()).to.be.true;
    });

    it("stop polling and throw if the operation call throws an unexpected error", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(502);

      await expect(
        extensionsApi.createInstance(
          PROJECT_ID,
          INSTANCE_ID,
          {
            name: "sources/blah",
            packageUri: "https://test.fake/pacakge.zip",
            hash: "abc123",
            spec: {
              name: "",
              version: "0.1.0",
              sourceUrl: "",
              roles: [],
              resources: [],
              params: [],
            },
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
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.params" })
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: false })
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await extensionsApi.configureInstance(PROJECT_ID, INSTANCE_ID, { MY_PARAM: "value" });
      expect(nock.isDone()).to.be.true;
    }).timeout(2000);

    it("should throw a FirebaseError if update returns an error response", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.params" })
        .reply(500);

      await expect(
        extensionsApi.configureInstance(PROJECT_ID, INSTANCE_ID, { MY_PARAM: "value" })
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("deleteInstance", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a DELETE call to the correct endpoint, and then poll on the returned operation", async () => {
      nock(api.extensionsOrigin)
        .delete(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await extensionsApi.deleteInstance(PROJECT_ID, INSTANCE_ID);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if delete returns an error response", async () => {
      nock(api.extensionsOrigin)
        .delete(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(404);

      await expect(extensionsApi.deleteInstance(PROJECT_ID, INSTANCE_ID)).to.be.rejectedWith(
        FirebaseError
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("updateInstance", () => {
    const testSource: extensionsApi.ExtensionSource = {
      name: "abc123",
      packageUri: "www.google.com/pack.zip",
      hash: "abc123",
      spec: {
        name: "abc123",
        version: "0.1.0",
        resources: [],
        sourceUrl: "www.google.com/pack.zip",
      },
    };
    afterEach(() => {
      nock.cleanAll();
    });

    it("should include config.param in updateMask is params are changed", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.source.name,config.params" })
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await extensionsApi.updateInstance(PROJECT_ID, INSTANCE_ID, testSource, {
        MY_PARAM: "value",
      });

      expect(nock.isDone()).to.be.true;
    });

    it("should not include config.param in updateMask is params aren't changed", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.source.name" })
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await extensionsApi.updateInstance(PROJECT_ID, INSTANCE_ID, testSource);

      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if update returns an error response", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.source.name,config.params" })
        .reply(500);

      await expect(
        extensionsApi.updateInstance(PROJECT_ID, INSTANCE_ID, testSource, { MY_PARAM: "value" })
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500");

      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getInstance", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a GET call to the correct endpoint", async () => {
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(200);

      await extensionsApi.getInstance(PROJECT_ID, INSTANCE_ID);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the endpoint returns an error response", async () => {
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(404);

      await expect(extensionsApi.getInstance(PROJECT_ID, INSTANCE_ID)).to.be.rejectedWith(
        FirebaseError
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("publishExtensionVersion", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a POST call to the correct endpoint, and then poll on the returned operation", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/publishers/test-pub/extensions/ext-one/versions:publish`)
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, {
          done: true,
          response: TEST_EXT_VERSION_3,
        });

      const res = await extensionsApi.publishExtensionVersion(
        TEST_EXT_VERSION_3.ref,
        "www.google.com/test-extension.zip"
      );
      expect(res).to.deep.equal(TEST_EXT_VERSION_3);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if publishExtensionVersion returns an error response", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions:publish`)
        .reply(500);

      await expect(
        extensionsApi.publishExtensionVersion(
          `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`,
          "www.google.com/test-extension.zip",
          "/"
        )
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500, Unknown Error");
      expect(nock.isDone()).to.be.true;
    });

    it("stop polling and throw if the operation call throws an unexpected error", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions:publish`)
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(502);

      await expect(
        extensionsApi.publishExtensionVersion(
          `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`,
          "www.google.com/test-extension.zip",
          "/"
        )
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 502, Unknown Error");
      expect(nock.isDone()).to.be.true;
    });

    it("should throw an error for an invalid ref", async () => {
      await expect(
        extensionsApi.publishExtensionVersion(
          `${PUBLISHER_ID}/${EXTENSION_ID}`,
          "www.google.com/test-extension.zip",
          "/"
        )
      ).to.be.rejectedWith(FirebaseError, "ExtensionVersion ref");
    });
  });

  describe("unpublishExtension", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a POST call to the correct endpoint", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}:unpublish`)
        .reply(200);

      await extensionsApi.unpublishExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the endpoint returns an error response", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}:unpublish`)
        .reply(404);

      await expect(
        extensionsApi.unpublishExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`)
      ).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw an error for an invalid ref", async () => {
      await expect(
        extensionsApi.unpublishExtension(`${PUBLISHER_ID}/${EXTENSION_ID}@`)
      ).to.be.rejectedWith(FirebaseError, "Extension reference must be in format");
    });
  });

  describe("unpublishExtensionVersion", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a POST call to the correct endpoint", async () => {
      nock(api.extensionsOrigin)
        .post(
          `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions/${EXTENSION_VERSION}-alpha.2:unpublish`
        )
        .reply(200);

      await extensionsApi.unpublishExtensionVersion(
        `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}-alpha.2`
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the endpoint returns an error response", async () => {
      nock(api.extensionsOrigin)
        .post(
          `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions/${EXTENSION_VERSION}:unpublish`
        )
        .reply(404);

      await expect(
        extensionsApi.unpublishExtensionVersion(
          `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`
        )
      ).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw an error for an invalid ref", async () => {
      await expect(
        extensionsApi.unpublishExtensionVersion(
          `${PUBLISHER_ID}/${EXTENSION_ID}/${EXTENSION_VERSION}`
        )
      ).to.be.rejectedWith(FirebaseError, "Extension reference must be in format");
    });
  });

  describe("getExtension", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a GET call to the correct endpoint", async () => {
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}`)
        .reply(200);

      await extensionsApi.getExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the endpoint returns an error response", async () => {
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}`)
        .reply(404);

      await expect(
        extensionsApi.getExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`)
      ).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw an error for an invalid ref", async () => {
      await expect(extensionsApi.getExtension(`${PUBLISHER_ID}`)).to.be.rejectedWith(
        FirebaseError,
        "Extension reference must be in format"
      );
    });
  });
});
