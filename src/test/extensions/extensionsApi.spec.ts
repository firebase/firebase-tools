import { expect } from "chai";
import * as nock from "nock";

import * as api from "../../api";
import { FirebaseError } from "../../error";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as refs from "../../extensions/refs";
import { cloneDeep } from "../../utils";

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
const TEST_EXTENSION_1 = {
  name: "publishers/test-pub/extensions/ext-one",
  ref: "test-pub/ext-one",
  state: "PUBLISHED",
  createTime: "2020-06-30T00:21:06.722782Z",
};
const TEST_EXTENSION_2 = {
  name: "publishers/test-pub/extensions/ext-two",
  ref: "test-pub/ext-two",
  state: "PUBLISHED",
  createTime: "2020-06-30T00:21:06.722782Z",
};
const TEST_EXTENSION_3 = {
  name: "publishers/test-pub/extensions/ext-three",
  ref: "test-pub/ext-three",
  state: "UNPUBLISHED",
  createTime: "2020-06-30T00:21:06.722782Z",
};
const TEST_EXT_VERSION_1 = {
  name: "publishers/test-pub/extensions/ext-one/versions/0.0.1",
  ref: "test-pub/ext-one@0.0.1",
  spec: EXT_SPEC,
  state: "UNPUBLISHED",
  hash: "12345",
  createTime: "2020-06-30T00:21:06.722782Z",
};
const TEST_EXT_VERSION_2 = {
  name: "publishers/test-pub/extensions/ext-one/versions/0.0.2",
  ref: "test-pub/ext-one@0.0.2",
  spec: EXT_SPEC,
  state: "PUBLISHED",
  hash: "23456",
  createTime: "2020-06-30T00:21:06.722782Z",
};
const TEST_EXT_VERSION_3 = {
  name: "publishers/test-pub/extensions/ext-one/versions/0.0.3",
  ref: "test-pub/ext-one@0.0.3",
  spec: EXT_SPEC,
  state: "PUBLISHED",
  hash: "34567",
  createTime: "2020-06-30T00:21:06.722782Z",
};
const TEST_EXT_VERSION_4 = {
  name: "publishers/test-pub/extensions/ext-one/versions/0.0.4",
  ref: "test-pub/ext-one@0.0.4",
  spec: EXT_SPEC,
  state: "DEPRECATED",
  hash: "34567",
  createTime: "2020-06-30T00:21:06.722782Z",
  deprecationMessage: "This version is deprecated",
};
const TEST_INSTANCE_1 = {
  name: "projects/invader-zim/instances/image-resizer-1",
  createTime: "2019-06-19T00:20:10.416947Z",
  updateTime: "2019-06-19T00:21:06.722782Z",
  state: "ACTIVE",
  config: {
    name: "projects/invader-zim/instances/image-resizer-1/configurations/5b1fb749-764d-4bd1-af60-bb7f22d27860",
    createTime: "2019-06-19T00:21:06.722782Z",
  },
};

const TEST_INSTANCE_2 = {
  name: "projects/invader-zim/instances/image-resizer",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE",
  config: {
    name: "projects/invader-zim/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
  },
};

const TEST_INSTANCES_RESPONSE = {
  instances: [TEST_INSTANCE_1, TEST_INSTANCE_2],
};

const TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN: any = cloneDeep(TEST_INSTANCES_RESPONSE);
TEST_INSTANCES_RESPONSE_NEXT_PAGE_TOKEN.nextPageToken = "abc123";

const PACKAGE_URI = "https://storage.googleapis.com/ABCD.zip";
const SOURCE_NAME = "projects/firebasemods/sources/abcd";
const TEST_SOURCE = {
  name: SOURCE_NAME,
  packageUri: PACKAGE_URI,
  hash: "deadbeef",
  spec: {
    name: "test",
    displayName: "Old",
    description: "descriptive",
    version: "1.0.0",
    license: "MIT",
    resources: [
      {
        name: "resource1",
        type: "firebaseextensions.v1beta.function",
        description: "desc",
        propertiesYaml:
          "eventTrigger:\n  eventType: providers/cloud.firestore/eventTypes/document.write\n  resource: projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION_PATH}/{documentId}\nlocation: ${LOCATION}",
      },
    ],
    author: { authorName: "Tester" },
    contributors: [{ authorName: "Tester 2" }],
    billingRequired: true,
    sourceUrl: "test.com",
    params: [],
  },
};

const NEXT_PAGE_TOKEN = "random123";
const PUBLISHED_EXTENSIONS = { extensions: [TEST_EXTENSION_1, TEST_EXTENSION_2] };
const ALL_EXTENSIONS = {
  extensions: [TEST_EXTENSION_1, TEST_EXTENSION_2, TEST_EXTENSION_3],
};
const PUBLISHED_WITH_TOKEN = { extensions: [TEST_EXTENSION_1], nextPageToken: NEXT_PAGE_TOKEN };
const NEXT_PAGE_EXTENSIONS = { extensions: [TEST_EXTENSION_2] };

const PUBLISHED_EXT_VERSIONS = { extensionVersions: [TEST_EXT_VERSION_2, TEST_EXT_VERSION_3] };
const ALL_EXT_VERSIONS = {
  extensionVersions: [TEST_EXT_VERSION_1, TEST_EXT_VERSION_2, TEST_EXT_VERSION_3],
};
const PUBLISHED_VERSIONS_WITH_TOKEN = {
  extensionVersions: [TEST_EXT_VERSION_2],
  nextPageToken: NEXT_PAGE_TOKEN,
};
const NEXT_PAGE_VERSIONS = { extensionVersions: [TEST_EXT_VERSION_3] };

describe("extensions", () => {
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

    it("should make a POST call to the correct endpoint, and then poll on the returned operation when given a source", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .query({ validateOnly: "false" })
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin).get(`/${VERSION}/operations/abc123`).reply(200, { done: true });

      await extensionsApi.createInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        extensionSource: {
          state: "ACTIVE",
          name: "sources/blah",
          packageUri: "https://test.fake/pacakge.zip",
          hash: "abc123",
          spec: { name: "", version: "0.1.0", sourceUrl: "", roles: [], resources: [], params: [] },
        },
        params: {},
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a POST call to the correct endpoint, and then poll on the returned operation when given an Extension ref", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .query({ validateOnly: "false" })
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin).get(`/${VERSION}/operations/abc123`).reply(200, { done: true });

      await extensionsApi.createInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        extensionVersionRef: "test-pub/test-ext@0.1.0",
        params: {},
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a POST and not poll if validateOnly=true", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .query({ validateOnly: "true" })
        .reply(200, { name: "operations/abc123", done: true });

      await extensionsApi.createInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        extensionVersionRef: "test-pub/test-ext@0.1.0",
        params: {},
        validateOnly: true,
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if create returns an error response", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/instances/`)
        .query({ validateOnly: "false" })
        .reply(500);

      await expect(
        extensionsApi.createInstance({
          projectId: PROJECT_ID,
          instanceId: INSTANCE_ID,
          extensionSource: {
            state: "ACTIVE",
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
          params: {},
        })
      ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500, Unknown Error");
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
        .query({ updateMask: "config.params", validateOnly: "false" })
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: false })
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true });

      await extensionsApi.configureInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        params: { MY_PARAM: "value" },
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a PATCH and not poll if validateOnly=true", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.params", validateOnly: "true" })
        .reply(200, { name: "operations/abc123", done: true });

      await extensionsApi.configureInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        params: { MY_PARAM: "value" },
        validateOnly: true,
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if update returns an error response", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.params", validateOnly: false })
        .reply(500);

      await expect(
        extensionsApi.configureInstance({
          projectId: PROJECT_ID,
          instanceId: INSTANCE_ID,
          params: { MY_PARAM: "value" },
        })
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
      nock(api.extensionsOrigin).get(`/${VERSION}/operations/abc123`).reply(200, { done: true });

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
      state: "ACTIVE",
      name: "abc123",
      packageUri: "www.google.com/pack.zip",
      hash: "abc123",
      spec: {
        name: "abc123",
        version: "0.1.0",
        resources: [],
        params: [],
        sourceUrl: "www.google.com/pack.zip",
      },
    };
    afterEach(() => {
      nock.cleanAll();
    });

    it("should include config.param in updateMask is params are changed", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.source.name,config.params", validateOnly: "false" })
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin).get(`/${VERSION}/operations/abc123`).reply(200, { done: true });

      await extensionsApi.updateInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        extensionSource: testSource,
        params: {
          MY_PARAM: "value",
        },
      });

      expect(nock.isDone()).to.be.true;
    });

    it("should not include config.param in updateMask is params aren't changed", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.source.name", validateOnly: "false" })
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin).get(`/${VERSION}/operations/abc123`).reply(200, { done: true });

      await extensionsApi.updateInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        extensionSource: testSource,
      });

      expect(nock.isDone()).to.be.true;
    });

    it("should make a PATCH and not poll if validateOnly=true", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.source.name", validateOnly: "true" })
        .reply(200, { name: "operations/abc123", done: true });

      await extensionsApi.updateInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        extensionSource: testSource,
        validateOnly: true,
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a PATCH and not poll if validateOnly=true", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.source.name", validateOnly: "true" })
        .reply(200, { name: "operations/abc123", done: true });

      await extensionsApi.updateInstance({
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        extensionSource: testSource,
        validateOnly: true,
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if update returns an error response", async () => {
      nock(api.extensionsOrigin)
        .patch(`/${VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .query({ updateMask: "config.source.name,config.params", validateOnly: false })
        .reply(500);

      await expect(
        extensionsApi.updateInstance({
          projectId: PROJECT_ID,
          instanceId: INSTANCE_ID,
          extensionSource: testSource,
          params: {
            MY_PARAM: "value",
          },
        })
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

  describe("getSource", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a GET call to the correct endpoint", async () => {
      nock(api.extensionsOrigin).get(`/${VERSION}/${SOURCE_NAME}`).reply(200, TEST_SOURCE);

      const source = await extensionsApi.getSource(SOURCE_NAME);
      expect(nock.isDone()).to.be.true;
      expect(source.spec.resources).to.have.lengthOf(1);
      expect(source.spec.resources[0]).to.have.property("properties");
    });

    it("should throw a FirebaseError if the endpoint returns an error response", async () => {
      nock(api.extensionsOrigin).get(`/${VERSION}/${SOURCE_NAME}`).reply(404);

      await expect(extensionsApi.getSource(SOURCE_NAME)).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("createSource", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a POST call to the correct endpoint, and then poll on the returned operation", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/sources/`)
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin)
        .get(`/${VERSION}/operations/abc123`)
        .reply(200, { done: true, response: TEST_SOURCE });

      const source = await extensionsApi.createSource(PROJECT_ID, PACKAGE_URI, ",./");
      expect(nock.isDone()).to.be.true;
      expect(source.spec.resources).to.have.lengthOf(1);
      expect(source.spec.resources[0]).to.have.property("properties");
    });

    it("should throw a FirebaseError if create returns an error response", async () => {
      nock(api.extensionsOrigin).post(`/${VERSION}/projects/${PROJECT_ID}/sources/`).reply(500);

      await expect(extensionsApi.createSource(PROJECT_ID, PACKAGE_URI, "./")).to.be.rejectedWith(
        FirebaseError,
        "HTTP Error: 500, Unknown Error"
      );
      expect(nock.isDone()).to.be.true;
    });

    it("stop polling and throw if the operation call throws an unexpected error", async () => {
      nock(api.extensionsOrigin)
        .post(`/${VERSION}/projects/${PROJECT_ID}/sources/`)
        .reply(200, { name: "operations/abc123" });
      nock(api.extensionsOrigin).get(`/${VERSION}/operations/abc123`).reply(502, {});

      await expect(extensionsApi.createSource(PROJECT_ID, PACKAGE_URI, "./")).to.be.rejectedWith(
        FirebaseError,
        "HTTP Error: 502, Unknown Error"
      );
      expect(nock.isDone()).to.be.true;
    });
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
    nock(api.extensionsOrigin).get(`/${VERSION}/operations/abc123`).reply(200, {
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
    nock(api.extensionsOrigin).get(`/${VERSION}/operations/abc123`).reply(502, {});

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

describe("deleteExtension", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should make a DELETE call to the correct endpoint", async () => {
    nock(api.extensionsOrigin)
      .delete(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}`)
      .reply(200);

    await extensionsApi.deleteExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.extensionsOrigin)
      .delete(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}`)
      .reply(404);

    await expect(
      extensionsApi.deleteExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`)
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(
      extensionsApi.deleteExtension(`${PUBLISHER_ID}/${EXTENSION_ID}@0.1.0`)
    ).to.be.rejectedWith(FirebaseError, "must not contain a version");
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
      extensionsApi.unpublishExtension(`${PUBLISHER_ID}/${EXTENSION_ID}@0.1.0`)
    ).to.be.rejectedWith(FirebaseError, "must not contain a version");
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

    await expect(extensionsApi.getExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`)).to.be.rejectedWith(
      FirebaseError
    );
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(extensionsApi.getExtension(`${PUBLISHER_ID}`)).to.be.rejectedWith(
      FirebaseError,
      "Unable to parse"
    );
  });
});

describe("getExtensionVersion", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should make a GET call to the correct endpoint", async () => {
    nock(api.extensionsOrigin)
      .get(
        `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions/${EXTENSION_VERSION}`
      )
      .reply(200, TEST_EXTENSION_1);

    const got = await extensionsApi.getExtensionVersion(
      `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`
    );
    expect(got).to.deep.equal(TEST_EXTENSION_1);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.extensionsOrigin)
      .get(
        `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions/${EXTENSION_VERSION}`
      )
      .reply(404);

    await expect(
      extensionsApi.getExtensionVersion(`${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`)
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(
      extensionsApi.getExtensionVersion(`${PUBLISHER_ID}//${EXTENSION_ID}`)
    ).to.be.rejectedWith(FirebaseError, "Unable to parse");
  });
});

describe("listExtensions", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should return a list of published extensions", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        return queryParams;
      })
      .reply(200, PUBLISHED_EXTENSIONS);

    const extensions = await extensionsApi.listExtensions(PUBLISHER_ID);
    expect(extensions).to.deep.equal(PUBLISHED_EXTENSIONS.extensions);
    expect(nock.isDone()).to.be.true;
  });

  it("should return a list of all extensions", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        return queryParams;
      })
      .reply(200, ALL_EXTENSIONS);

    const extensions = await extensionsApi.listExtensions(PUBLISHER_ID);

    expect(extensions).to.deep.equal(ALL_EXTENSIONS.extensions);
    expect(nock.isDone()).to.be.true;
  });

  it("should query for more extensions if the response has a next_page_token", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        return queryParams;
      })
      .reply(200, PUBLISHED_WITH_TOKEN);
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        queryParams.pageToken === NEXT_PAGE_TOKEN;
        return queryParams;
      })
      .reply(200, NEXT_PAGE_EXTENSIONS);

    const extensions = await extensionsApi.listExtensions(PUBLISHER_ID);

    const expected = PUBLISHED_WITH_TOKEN.extensions.concat(NEXT_PAGE_EXTENSIONS.extensions);
    expect(extensions).to.deep.equal(expected);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw FirebaseError if any call returns an error", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        return queryParams;
      })
      .reply(503, PUBLISHED_EXTENSIONS);

    await expect(extensionsApi.listExtensions(PUBLISHER_ID)).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});

describe("listExtensionVersions", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should return a list of published extension versions", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100";
      })
      .reply(200, PUBLISHED_EXT_VERSIONS);

    const extensions = await extensionsApi.listExtensionVersions(`${PUBLISHER_ID}/${EXTENSION_ID}`);
    expect(extensions).to.deep.equal(PUBLISHED_EXT_VERSIONS.extensionVersions);
    expect(nock.isDone()).to.be.true;
  });

  it("should send filter query param", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100" && queryParams.filter === "id<1.0.0";
      })
      .reply(200, PUBLISHED_EXT_VERSIONS);

    const extensions = await extensionsApi.listExtensionVersions(
      `${PUBLISHER_ID}/${EXTENSION_ID}`,
      "id<1.0.0"
    );
    expect(extensions).to.deep.equal(PUBLISHED_EXT_VERSIONS.extensionVersions);
    expect(nock.isDone()).to.be.true;
  });

  it("should return a list of all extension versions", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100";
      })
      .reply(200, ALL_EXT_VERSIONS);

    const extensions = await extensionsApi.listExtensionVersions(`${PUBLISHER_ID}/${EXTENSION_ID}`);

    expect(extensions).to.deep.equal(ALL_EXT_VERSIONS.extensionVersions);
    expect(nock.isDone()).to.be.true;
  });

  it("should query for more extension versions if the response has a next_page_token", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100";
      })
      .reply(200, PUBLISHED_VERSIONS_WITH_TOKEN);
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100" && queryParams.pageToken === NEXT_PAGE_TOKEN;
      })
      .reply(200, NEXT_PAGE_VERSIONS);

    const extensions = await extensionsApi.listExtensionVersions(`${PUBLISHER_ID}/${EXTENSION_ID}`);

    const expected = PUBLISHED_VERSIONS_WITH_TOKEN.extensionVersions.concat(
      NEXT_PAGE_VERSIONS.extensionVersions
    );
    expect(extensions).to.deep.equal(expected);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw FirebaseError if any call returns an error", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100";
      })
      .reply(200, PUBLISHED_VERSIONS_WITH_TOKEN);
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100" && queryParams.pageToken === NEXT_PAGE_TOKEN;
      })
      .reply(500);

    await expect(
      extensionsApi.listExtensionVersions(`${PUBLISHER_ID}/${EXTENSION_ID}`)
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(extensionsApi.listExtensionVersions("")).to.be.rejectedWith(
      FirebaseError,
      "Unable to parse"
    );
  });
});

describe("getPublisherProfile", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const PUBLISHER_PROFILE = {
    name: "projects/test-publisher/publisherProfile",
    publisherId: "test-publisher",
    registerTime: "2020-06-30T00:21:06.722782Z",
  };
  it("should make a GET call to the correct endpoint", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/projects/${PROJECT_ID}/publisherProfile`)
      .query(true)
      .reply(200, PUBLISHER_PROFILE);

    const res = await extensionsApi.getPublisherProfile(PROJECT_ID);
    expect(res).to.deep.equal(PUBLISHER_PROFILE);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.extensionsOrigin)
      .get(`/${VERSION}/projects/${PROJECT_ID}/publisherProfile`)
      .query(true)
      .reply(404);

    await expect(extensionsApi.getPublisherProfile(PROJECT_ID)).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});

describe("registerPublisherProfile", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const PUBLISHER_PROFILE = {
    name: "projects/test-publisher/publisherProfile",
    publisherId: "test-publisher",
    registerTime: "2020-06-30T00:21:06.722782Z",
  };
  it("should make a POST call to the correct endpoint", async () => {
    nock(api.extensionsOrigin)
      .post(`/${VERSION}/projects/${PROJECT_ID}/publisherProfile:register`)
      .reply(200, PUBLISHER_PROFILE);

    const res = await extensionsApi.registerPublisherProfile(PROJECT_ID, PUBLISHER_ID);
    expect(res).to.deep.equal(PUBLISHER_PROFILE);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.extensionsOrigin)
      .post(`/${VERSION}/projects/${PROJECT_ID}/publisherProfile:register`)
      .reply(404);
    await expect(
      extensionsApi.registerPublisherProfile(PROJECT_ID, PUBLISHER_ID)
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});

describe("deprecateExtensionVersion", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should make a POST call to the correct endpoint", async () => {
    const { publisherId, extensionId, version } = refs.parse(TEST_EXT_VERSION_4.ref);
    nock(api.extensionsOrigin)
      .persist()
      .post(
        `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:deprecate`
      )
      .reply(200, TEST_EXT_VERSION_4);

    const res = await extensionsApi.deprecateExtensionVersion(
      TEST_EXT_VERSION_4.ref,
      "This version is deprecated."
    );
    expect(res).to.deep.equal(TEST_EXT_VERSION_4);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    const { publisherId, extensionId, version } = refs.parse(TEST_EXT_VERSION_4.ref);
    nock(api.extensionsOrigin)
      .persist()
      .post(
        `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:deprecate`
      )
      .reply(404);
    await expect(
      extensionsApi.deprecateExtensionVersion(TEST_EXT_VERSION_4.ref, "This version is deprecated.")
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});

describe("undeprecateExtensionVersion", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should make a POST call to the correct endpoint", async () => {
    const { publisherId, extensionId, version } = refs.parse(TEST_EXT_VERSION_3.ref);
    nock(api.extensionsOrigin)
      .persist()
      .post(
        `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:undeprecate`
      )
      .reply(200, TEST_EXT_VERSION_3);

    const res = await extensionsApi.undeprecateExtensionVersion(TEST_EXT_VERSION_3.ref);
    expect(res).to.deep.equal(TEST_EXT_VERSION_3);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    const { publisherId, extensionId, version } = refs.parse(TEST_EXT_VERSION_3.ref);
    nock(api.extensionsOrigin)
      .persist()
      .post(
        `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:undeprecate`
      )
      .reply(404);
    await expect(
      extensionsApi.undeprecateExtensionVersion(TEST_EXT_VERSION_3.ref)
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});
