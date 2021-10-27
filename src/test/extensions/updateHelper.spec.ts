import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import { firebaseExtensionsRegistryOrigin } from "../../api";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as extensionsHelper from "../../extensions/extensionsHelper";
import * as prompt from "../../prompt";
import * as resolveSource from "../../extensions/resolveSource";
import * as updateHelper from "../../extensions/updateHelper";

const SPEC = {
  name: "test",
  displayName: "Old",
  description: "descriptive",
  version: "0.2.0",
  license: "MIT",
  apis: [
    { apiName: "api1", reason: "" },
    { apiName: "api2", reason: "" },
  ],
  roles: [
    { role: "role1", reason: "" },
    { role: "role2", reason: "" },
  ],
  resources: [
    { name: "resource1", type: "firebaseextensions.v1beta.function", description: "desc" },
    { name: "resource2", type: "other", description: "" },
  ],
  author: { authorName: "Tester" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
};

const OLD_SPEC = Object.assign({}, SPEC, { version: "0.1.0" });

const SOURCE = {
  name: "projects/firebasemods/sources/new-test-source",
  packageUri: "https://firebase-fake-bucket.com",
  hash: "1234567",
  spec: SPEC,
};

const EXTENSION_VERSION = {
  name: "publishers/test-publisher/extensions/test/versions/0.2.0",
  ref: "test-publisher/test@0.2.0",
  spec: SPEC,
  state: "PUBLISHED",
  hash: "abcdefg",
  createTime: "2020-06-30T00:21:06.722782Z",
};

const EXTENSION = {
  name: "publishers/test-publisher/extensions/test",
  ref: "test-publisher/test",
  state: "PUBLISHED",
  createTime: "2020-06-30T00:21:06.722782Z",
  latestVersion: "0.2.0",
};

const REGISTRY_ENTRY = {
  name: "test",
  labels: {
    latest: "0.2.0",
    minRequired: "0.1.1",
  },
  versions: {
    "0.1.0": "projects/firebasemods/sources/2kd",
    "0.1.1": "projects/firebasemods/sources/xyz",
    "0.1.2": "projects/firebasemods/sources/123",
    "0.2.0": "projects/firebasemods/sources/abc",
  },
  updateWarnings: {
    ">0.1.0 <0.2.0": [
      {
        from: "0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "After updating, it is highly recommended that you switch your Cloud Scheduler jobs to <b>PubSub</b>",
      },
    ],
    ">=0.2.0": [
      {
        from: "0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "After updating, you must switch your Cloud Scheduler jobs to <b>PubSub</b>, otherwise your extension will stop running.",
      },
      {
        from: ">0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "If you have not already done so during a previous update, after updating, you must switch your Cloud Scheduler jobs to <b>PubSub</b>, otherwise your extension will stop running.",
      },
    ],
  },
};

const INSTANCE = {
  name: "projects/invader-zim/instances/instance-of-official-ext",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE",
  config: {
    name:
      "projects/invader-zim/instances/instance-of-official-ext/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    sourceId: "fake-official-source",
    sourceName: "projects/firebasemods/sources/fake-official-source",
    source: {
      name: "projects/firebasemods/sources/fake-official-source",
    },
  },
};

const REGISTRY_INSTANCE = {
  name: "projects/invader-zim/instances/instance-of-registry-ext",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE",
  config: {
    name:
      "projects/invader-zim/instances/instance-of-registry-ext/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    sourceId: "fake-registry-source",
    sourceName: "projects/firebasemods/sources/fake-registry-source",
    extensionRef: "test-publisher/test",
    source: {
      name: "projects/firebasemods/sources/fake-registry-source",
    },
  },
};

const LOCAL_INSTANCE = {
  name: "projects/invader-zim/instances/instance-of-local-ext",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE",
  config: {
    name:
      "projects/invader-zim/instances/instance-of-local-ext/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    sourceId: "fake-registry-source",
    sourceName: "projects/firebasemods/sources/fake-local-source",
    source: {
      name: "projects/firebasemods/sources/fake-local-source",
    },
  },
};

describe("updateHelper", () => {
  describe("updateFromLocalSource", () => {
    let createSourceStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      createSourceStub = sinon.stub(extensionsHelper, "createSourceFromLocation");
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(INSTANCE);

      // The logic will fetch the extensions registry, but it doesn't need to receive anything.
      nock(firebaseExtensionsRegistryOrigin).get("/extensions.json").reply(200, {});
    });

    afterEach(() => {
      createSourceStub.restore();
      getInstanceStub.restore();

      nock.cleanAll();
    });

    it("should return the correct source name for a valid local source", async () => {
      createSourceStub.resolves(SOURCE);
      const name = await updateHelper.updateFromLocalSource(
        "test-project",
        "test-instance",
        ".",
        SPEC
      );
      expect(name).to.equal(SOURCE.name);
    });

    it("should throw an error for an invalid source", async () => {
      createSourceStub.throwsException("Invalid source");
      await expect(
        updateHelper.updateFromLocalSource("test-project", "test-instance", ".", SPEC)
      ).to.be.rejectedWith(FirebaseError, "Unable to update from the source");
    });
  });

  describe("updateFromUrlSource", () => {
    let createSourceStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      createSourceStub = sinon.stub(extensionsHelper, "createSourceFromLocation");
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(INSTANCE);

      // The logic will fetch the extensions registry, but it doesn't need to receive anything.
      nock(firebaseExtensionsRegistryOrigin).get("/extensions.json").reply(200, {});
    });

    afterEach(() => {
      createSourceStub.restore();
      getInstanceStub.restore();

      nock.cleanAll();
    });

    it("should return the correct source name for a valid url source", async () => {
      createSourceStub.resolves(SOURCE);
      const name = await updateHelper.updateFromUrlSource(
        "test-project",
        "test-instance",
        "https://valid-source.tar.gz",
        SPEC
      );
      expect(name).to.equal(SOURCE.name);
    });

    it("should throw an error for an invalid source", async () => {
      createSourceStub.throws("Invalid source");
      await expect(
        updateHelper.updateFromUrlSource(
          "test-project",
          "test-instance",
          "https://valid-source.tar.gz",
          SPEC
        )
      ).to.be.rejectedWith(FirebaseError, "Unable to update from the source");
    });
  });

  describe("updateToVersionFromPublisherSource", () => {
    let getExtensionStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let listExtensionVersionStub: sinon.SinonStub;
    let registryStub: sinon.SinonStub;
    let isOfficialStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      getExtensionStub = sinon.stub(extensionsApi, "getExtension");
      createSourceStub = sinon.stub(extensionsApi, "getExtensionVersion");
      listExtensionVersionStub = sinon.stub(extensionsApi, "listExtensionVersions");
      registryStub = sinon.stub(resolveSource, "resolveRegistryEntry");
      registryStub.resolves(REGISTRY_ENTRY);
      isOfficialStub = sinon.stub(resolveSource, "isOfficialSource");
      isOfficialStub.returns(false);
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(REGISTRY_INSTANCE);
    });

    afterEach(() => {
      getExtensionStub.restore();
      createSourceStub.restore();
      listExtensionVersionStub.restore();
      registryStub.restore();
      isOfficialStub.restore();
      getInstanceStub.restore();
    });

    it("should return the correct source name for a valid published extension version source", async () => {
      getExtensionStub.resolves(EXTENSION);
      createSourceStub.resolves(EXTENSION_VERSION);
      listExtensionVersionStub.resolves([]);
      const name = await updateHelper.updateToVersionFromPublisherSource(
        "test-project",
        "test-instance",
        "test-publisher/test@0.2.0",
        SPEC
      );
      expect(name).to.equal(EXTENSION_VERSION.name);
    });

    it("should throw an error for an invalid source", async () => {
      getExtensionStub.throws(Error("NOT FOUND"));
      createSourceStub.throws(Error("NOT FOUND"));
      listExtensionVersionStub.resolves([]);
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-project",
          "test-instance",
          "test-publisher/test@1.2.3",
          SPEC
        )
      ).to.be.rejectedWith("NOT FOUND");
    });
  });

  describe("updateFromPublisherSource", () => {
    let getExtensionStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let listExtensionVersionStub: sinon.SinonStub;
    let registryStub: sinon.SinonStub;
    let isOfficialStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      getExtensionStub = sinon.stub(extensionsApi, "getExtension");
      createSourceStub = sinon.stub(extensionsApi, "getExtensionVersion");
      listExtensionVersionStub = sinon.stub(extensionsApi, "listExtensionVersions");
      registryStub = sinon.stub(resolveSource, "resolveRegistryEntry");
      registryStub.resolves(REGISTRY_ENTRY);
      isOfficialStub = sinon.stub(resolveSource, "isOfficialSource");
      isOfficialStub.returns(false);
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(REGISTRY_INSTANCE);
    });

    afterEach(() => {
      getExtensionStub.restore();
      createSourceStub.restore();
      listExtensionVersionStub.restore();
      registryStub.restore();
      isOfficialStub.restore();
      getInstanceStub.restore();
    });

    it("should return the correct source name for the latest published extension source", async () => {
      getExtensionStub.resolves(EXTENSION);
      createSourceStub.resolves(EXTENSION_VERSION);
      listExtensionVersionStub.resolves([]);
      const name = await updateHelper.updateToVersionFromPublisherSource(
        "test-project",
        "test-instance",
        "test-publisher/test",
        SPEC
      );
      expect(name).to.equal(EXTENSION_VERSION.name);
    });

    it("should throw an error for an invalid source", async () => {
      getExtensionStub.throws(Error("NOT FOUND"));
      createSourceStub.throws(Error("NOT FOUND"));
      listExtensionVersionStub.resolves([]);
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-project",
          "test-instance",
          "test-publisher/test",
          SPEC
        )
      ).to.be.rejectedWith("NOT FOUND");
    });
  });
});

describe("inferUpdateSource", () => {
  it("should infer update source from ref without version", () => {
    const result = updateHelper.inferUpdateSource("", "firebase/storage-resize-images");
    expect(result).to.equal("firebase/storage-resize-images@latest");
  });

  it("should infer update source from ref with just version", () => {
    const result = updateHelper.inferUpdateSource("0.1.2", "firebase/storage-resize-images");
    expect(result).to.equal("firebase/storage-resize-images@0.1.2");
  });

  it("should infer update source from ref and extension name", () => {
    const result = updateHelper.inferUpdateSource(
      "storage-resize-images",
      "firebase/storage-resize-images"
    );
    expect(result).to.equal("firebase/storage-resize-images@latest");
  });

  it("should infer update source if it is a ref distinct from the input ref", () => {
    const result = updateHelper.inferUpdateSource(
      "notfirebase/storage-resize-images",
      "firebase/storage-resize-images"
    );
    expect(result).to.equal("notfirebase/storage-resize-images@latest");
  });
});

describe("getExistingSourceOrigin", () => {
  let getInstanceStub: sinon.SinonStub;

  afterEach(() => {
    getInstanceStub.restore();
  });

  it("should return published extension as source origin", async () => {
    getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(REGISTRY_INSTANCE);

    const result = await updateHelper.getExistingSourceOrigin(
      "invader-zim",
      "instance-of-registry-ext",
      "ext-testing",
      "projects/firebasemods/sources/fake-registry-source"
    );

    expect(result).to.equal(extensionsHelper.SourceOrigin.PUBLISHED_EXTENSION);
  });

  it("should return local extension as source origin", async () => {
    getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(LOCAL_INSTANCE);

    const result = await updateHelper.getExistingSourceOrigin(
      "invader-zim",
      "instance-of-local-ext",
      "ext-testing",
      "projects/firebasemods/sources/fake-local-source"
    );

    expect(result).to.equal(extensionsHelper.SourceOrigin.LOCAL);
  });
});
