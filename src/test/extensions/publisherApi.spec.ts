import { expect } from "chai";
import * as nock from "nock";

import * as api from "../../api";
import * as refs from "../../extensions/refs";
import * as publisherApi from "../../extensions/publisherApi";

import { FirebaseError } from "../../error";

const VERSION = "v1beta";
const PROJECT_ID = "test-project";
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

describe("createExtensionVersionFromGitHubSource", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should make a POST call to the correct endpoint, and then poll on the returned operation", async () => {
    nock(api.extensionsPublisherOrigin)
      .post(`/${VERSION}/publishers/test-pub/extensions/ext-one/versions:createFromSource`)
      .reply(200, { name: "operations/abc123" });
    nock(api.extensionsPublisherOrigin).get(`/${VERSION}/operations/abc123`).reply(200, {
      done: true,
      response: TEST_EXT_VERSION_3,
    });

    const res = await publisherApi.createExtensionVersionFromGitHubSource({
      extensionVersionRef: TEST_EXT_VERSION_3.ref,
      repoUri: "https://github.com/username/repo",
      sourceRef: "HEAD",
      extensionRoot: "/",
    });
    expect(res).to.deep.equal(TEST_EXT_VERSION_3);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if createExtensionVersionFromLocalSource returns an error response", async () => {
    nock(api.extensionsPublisherOrigin)
      .post(
        `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions:createFromSource`,
      )
      .reply(500);

    await expect(
      publisherApi.createExtensionVersionFromGitHubSource({
        extensionVersionRef: `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`,
        repoUri: "https://github.com/username/repo",
        sourceRef: "HEAD",
        extensionRoot: "/",
      }),
    ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500, Unknown Error");
    expect(nock.isDone()).to.be.true;
  });

  it("stop polling and throw if the operation call throws an unexpected error", async () => {
    nock(api.extensionsPublisherOrigin)
      .post(
        `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions:createFromSource`,
      )
      .reply(200, { name: "operations/abc123" });
    nock(api.extensionsPublisherOrigin).get(`/${VERSION}/operations/abc123`).reply(502, {});

    await expect(
      publisherApi.createExtensionVersionFromGitHubSource({
        extensionVersionRef: `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`,
        repoUri: "https://github.com/username/repo",
        sourceRef: "HEAD",
        extensionRoot: "/",
      }),
    ).to.be.rejectedWith(FirebaseError, "HTTP Error: 502, Unknown Error");
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(
      publisherApi.createExtensionVersionFromGitHubSource({
        extensionVersionRef: `${PUBLISHER_ID}/${EXTENSION_ID}`,
        repoUri: "https://github.com/username/repo",
        sourceRef: "HEAD",
        extensionRoot: "/",
      }),
    ).to.be.rejectedWith(FirebaseError, "Extension version ref");
  });
});

describe("createExtensionVersionFromLocalSource", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should make a POST call to the correct endpoint, and then poll on the returned operation", async () => {
    nock(api.extensionsPublisherOrigin)
      .post(`/${VERSION}/publishers/test-pub/extensions/ext-one/versions:createFromSource`)
      .reply(200, { name: "operations/abc123" });
    nock(api.extensionsPublisherOrigin).get(`/${VERSION}/operations/abc123`).reply(200, {
      done: true,
      response: TEST_EXT_VERSION_3,
    });

    const res = await publisherApi.createExtensionVersionFromLocalSource({
      extensionVersionRef: TEST_EXT_VERSION_3.ref,
      packageUri: "www.google.com/test-extension.zip",
    });
    expect(res).to.deep.equal(TEST_EXT_VERSION_3);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if createExtensionVersionFromLocalSource returns an error response", async () => {
    nock(api.extensionsPublisherOrigin)
      .post(
        `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions:createFromSource`,
      )
      .reply(500);

    await expect(
      publisherApi.createExtensionVersionFromLocalSource({
        extensionVersionRef: `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`,
        packageUri: "www.google.com/test-extension.zip",
        extensionRoot: "/",
      }),
    ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500, Unknown Error");
    expect(nock.isDone()).to.be.true;
  });

  it("stop polling and throw if the operation call throws an unexpected error", async () => {
    nock(api.extensionsPublisherOrigin)
      .post(
        `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions:createFromSource`,
      )
      .reply(200, { name: "operations/abc123" });
    nock(api.extensionsPublisherOrigin).get(`/${VERSION}/operations/abc123`).reply(502, {});

    await expect(
      publisherApi.createExtensionVersionFromLocalSource({
        extensionVersionRef: `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`,
        packageUri: "www.google.com/test-extension.zip",
        extensionRoot: "/",
      }),
    ).to.be.rejectedWith(FirebaseError, "HTTP Error: 502, Unknown Error");
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(
      publisherApi.createExtensionVersionFromLocalSource({
        extensionVersionRef: `${PUBLISHER_ID}/${EXTENSION_ID}`,
        packageUri: "www.google.com/test-extension.zip",
        extensionRoot: "/",
      }),
    ).to.be.rejectedWith(FirebaseError, "Extension version ref");
  });
});

describe("getExtension", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should make a GET call to the correct endpoint", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}`)
      .reply(200);

    await publisherApi.getExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}`)
      .reply(404);

    await expect(publisherApi.getExtension(`${PUBLISHER_ID}/${EXTENSION_ID}`)).to.be.rejectedWith(
      FirebaseError,
    );
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(publisherApi.getExtension(`${PUBLISHER_ID}`)).to.be.rejectedWith(
      FirebaseError,
      "Unable to parse",
    );
  });
});

describe("getExtensionVersion", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should make a GET call to the correct endpoint", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(
        `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions/${EXTENSION_VERSION}`,
      )
      .reply(200, TEST_EXTENSION_1);

    const got = await publisherApi.getExtensionVersion(
      `${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`,
    );
    expect(got).to.deep.equal(TEST_EXTENSION_1);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(
        `/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions/${EXTENSION_VERSION}`,
      )
      .reply(404);

    await expect(
      publisherApi.getExtensionVersion(`${PUBLISHER_ID}/${EXTENSION_ID}@${EXTENSION_VERSION}`),
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(
      publisherApi.getExtensionVersion(`${PUBLISHER_ID}//${EXTENSION_ID}`),
    ).to.be.rejectedWith(FirebaseError, "Unable to parse");
  });
});

describe("listExtensions", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should return a list of published extensions", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        return queryParams;
      })
      .reply(200, PUBLISHED_EXTENSIONS);

    const extensions = await publisherApi.listExtensions(PUBLISHER_ID);
    expect(extensions).to.deep.equal(PUBLISHED_EXTENSIONS.extensions);
    expect(nock.isDone()).to.be.true;
  });

  it("should return a list of all extensions", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        return queryParams;
      })
      .reply(200, ALL_EXTENSIONS);

    const extensions = await publisherApi.listExtensions(PUBLISHER_ID);

    expect(extensions).to.deep.equal(ALL_EXTENSIONS.extensions);
    expect(nock.isDone()).to.be.true;
  });

  it("should query for more extensions if the response has a next_page_token", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        return queryParams;
      })
      .reply(200, PUBLISHED_WITH_TOKEN);
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        queryParams.pageToken === NEXT_PAGE_TOKEN;
        return queryParams;
      })
      .reply(200, NEXT_PAGE_EXTENSIONS);

    const extensions = await publisherApi.listExtensions(PUBLISHER_ID);

    const expected = PUBLISHED_WITH_TOKEN.extensions.concat(NEXT_PAGE_EXTENSIONS.extensions);
    expect(extensions).to.deep.equal(expected);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw FirebaseError if any call returns an error", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions`)
      .query((queryParams: any) => {
        queryParams.pageSize === "100";
        return queryParams;
      })
      .reply(503, PUBLISHED_EXTENSIONS);

    await expect(publisherApi.listExtensions(PUBLISHER_ID)).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});

describe("listExtensionVersions", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should return a list of published extension versions", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100";
      })
      .reply(200, PUBLISHED_EXT_VERSIONS);

    const extensions = await publisherApi.listExtensionVersions(`${PUBLISHER_ID}/${EXTENSION_ID}`);
    expect(extensions).to.deep.equal(PUBLISHED_EXT_VERSIONS.extensionVersions);
    expect(nock.isDone()).to.be.true;
  });

  it("should send filter query param", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100" && queryParams.filter === "id<1.0.0";
      })
      .reply(200, PUBLISHED_EXT_VERSIONS);

    const extensions = await publisherApi.listExtensionVersions(
      `${PUBLISHER_ID}/${EXTENSION_ID}`,
      "id<1.0.0",
    );
    expect(extensions).to.deep.equal(PUBLISHED_EXT_VERSIONS.extensionVersions);
    expect(nock.isDone()).to.be.true;
  });

  it("should return a list of all extension versions", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100";
      })
      .reply(200, ALL_EXT_VERSIONS);

    const extensions = await publisherApi.listExtensionVersions(`${PUBLISHER_ID}/${EXTENSION_ID}`);

    expect(extensions).to.deep.equal(ALL_EXT_VERSIONS.extensionVersions);
    expect(nock.isDone()).to.be.true;
  });

  it("should query for more extension versions if the response has a next_page_token", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100";
      })
      .reply(200, PUBLISHED_VERSIONS_WITH_TOKEN);
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100" && queryParams.pageToken === NEXT_PAGE_TOKEN;
      })
      .reply(200, NEXT_PAGE_VERSIONS);

    const extensions = await publisherApi.listExtensionVersions(`${PUBLISHER_ID}/${EXTENSION_ID}`);

    const expected = PUBLISHED_VERSIONS_WITH_TOKEN.extensionVersions.concat(
      NEXT_PAGE_VERSIONS.extensionVersions,
    );
    expect(extensions).to.deep.equal(expected);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw FirebaseError if any call returns an error", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100";
      })
      .reply(200, PUBLISHED_VERSIONS_WITH_TOKEN);
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/publishers/${PUBLISHER_ID}/extensions/${EXTENSION_ID}/versions`)
      .query((queryParams: any) => {
        return queryParams.pageSize === "100" && queryParams.pageToken === NEXT_PAGE_TOKEN;
      })
      .reply(500);

    await expect(
      publisherApi.listExtensionVersions(`${PUBLISHER_ID}/${EXTENSION_ID}`),
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error for an invalid ref", async () => {
    await expect(publisherApi.listExtensionVersions("")).to.be.rejectedWith(
      FirebaseError,
      "Unable to parse",
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
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/projects/${PROJECT_ID}/publisherProfile`)
      .query(true)
      .reply(200, PUBLISHER_PROFILE);

    const res = await publisherApi.getPublisherProfile(PROJECT_ID);
    expect(res).to.deep.equal(PUBLISHER_PROFILE);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.extensionsPublisherOrigin)
      .get(`/${VERSION}/projects/${PROJECT_ID}/publisherProfile`)
      .query(true)
      .reply(404);

    await expect(publisherApi.getPublisherProfile(PROJECT_ID)).to.be.rejectedWith(FirebaseError);
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
    nock(api.extensionsPublisherOrigin)
      .patch(
        `/${VERSION}/projects/${PROJECT_ID}/publisherProfile?updateMask=publisher_id%2Cdisplay_name`,
      )
      .reply(200, PUBLISHER_PROFILE);

    const res = await publisherApi.registerPublisherProfile(PROJECT_ID, PUBLISHER_ID);
    expect(res).to.deep.equal(PUBLISHER_PROFILE);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.extensionsPublisherOrigin)
      .patch(
        `/${VERSION}/projects/${PROJECT_ID}/publisherProfile?updateMask=publisher_id%2Cdisplay_name`,
      )
      .reply(404);
    await expect(
      publisherApi.registerPublisherProfile(PROJECT_ID, PUBLISHER_ID),
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
    nock(api.extensionsPublisherOrigin)
      .persist()
      .post(
        `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:deprecate`,
      )
      .reply(200, TEST_EXT_VERSION_4);

    const res = await publisherApi.deprecateExtensionVersion(
      TEST_EXT_VERSION_4.ref,
      "This version is deprecated.",
    );
    expect(res).to.deep.equal(TEST_EXT_VERSION_4);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    const { publisherId, extensionId, version } = refs.parse(TEST_EXT_VERSION_4.ref);
    nock(api.extensionsPublisherOrigin)
      .persist()
      .post(
        `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:deprecate`,
      )
      .reply(404);
    await expect(
      publisherApi.deprecateExtensionVersion(TEST_EXT_VERSION_4.ref, "This version is deprecated."),
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
    nock(api.extensionsPublisherOrigin)
      .persist()
      .post(
        `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:undeprecate`,
      )
      .reply(200, TEST_EXT_VERSION_3);

    const res = await publisherApi.undeprecateExtensionVersion(TEST_EXT_VERSION_3.ref);
    expect(res).to.deep.equal(TEST_EXT_VERSION_3);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    const { publisherId, extensionId, version } = refs.parse(TEST_EXT_VERSION_3.ref);
    nock(api.extensionsPublisherOrigin)
      .persist()
      .post(
        `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:undeprecate`,
      )
      .reply(404);
    await expect(
      publisherApi.undeprecateExtensionVersion(TEST_EXT_VERSION_3.ref),
    ).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});
