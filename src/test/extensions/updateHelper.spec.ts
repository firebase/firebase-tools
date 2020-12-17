import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as updateHelper from "../../extensions/updateHelper";
import * as prompt from "../../prompt";
import * as extensionsHelper from "../../extensions/extensionsHelper";
import * as resolveSource from "../../extensions/resolveSource";
import * as extensionsApi from "../../extensions/extensionsApi";

const SPEC = {
  name: "test",
  displayName: "Old",
  description: "descriptive",
  version: "0.1.0",
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
  spec: SPEC,
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
      "projects/invader-zim/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    sourceId: "fake-official-source",
    sourceName: "projects/firebasemods/sources/fake-official-source",
    source: {
      name: "projects/firebasemods/sources/fake-official-source",
    },
  },
};

const REGISTRY_INSTANCE = {
  name: "projects/invader-zim/instances/fake-official-instance",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE",
  config: {
    name:
      "projects/invader-zim/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    sourceId: "fake-registry-source",
    sourceName: "projects/firebasemods/sources/fake-registry-source",
    source: {
      name: "projects/firebasemods/sources/fake-registry-source",
    },
  },
};

describe("updateHelper", () => {
  describe("updateFromLocalSource", () => {
    let promptStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      createSourceStub = sinon.stub(extensionsHelper, "createSourceFromLocation");
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(INSTANCE);
    });

    afterEach(() => {
      promptStub.restore();
      createSourceStub.restore();
      getInstanceStub.restore();
    });

    it("should return the correct source name for a valid local source", async () => {
      promptStub.resolves(true);
      createSourceStub.resolves(SOURCE);
      const name = await updateHelper.updateFromLocalSource(
        "test-project",
        "test-instance",
        ".",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal(SOURCE.name);
    });

    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      createSourceStub.throwsException("Invalid source");
      await expect(
        updateHelper.updateFromLocalSource("test-project", "test-instance", ".", SPEC, SPEC.name)
      ).to.be.rejectedWith(FirebaseError, "Unable to update from the source");
    });

    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      createSourceStub.resolves(SOURCE);
      await expect(
        updateHelper.updateFromLocalSource("test-project", "test-instance", ".", SPEC, SPEC.name)
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  });

  describe("updateFromUrlSource", () => {
    let promptStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      createSourceStub = sinon.stub(extensionsHelper, "createSourceFromLocation");
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(INSTANCE);
    });

    afterEach(() => {
      promptStub.restore();
      createSourceStub.restore();
      getInstanceStub.restore();
    });

    it("should return the correct source name for a valid url source", async () => {
      promptStub.resolves(true);
      createSourceStub.resolves(SOURCE);
      const name = await updateHelper.updateFromUrlSource(
        "test-project",
        "test-instance",
        "https://valid-source.tar.gz",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal(SOURCE.name);
    });

    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      createSourceStub.throws("Invalid source");
      await expect(
        updateHelper.updateFromUrlSource(
          "test-project",
          "test-instance",
          "https://valid-source.tar.gz",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith(FirebaseError, "Unable to update from the source");
    });

    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      createSourceStub.resolves(SOURCE);
      await expect(
        updateHelper.updateFromUrlSource(
          "test-project",
          "test-instance",
          "https://valid-source.tar.gz",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  });

  describe("updateToVersionFromPublisherSource", () => {
    let promptStub: sinon.SinonStub;
    let getExtensionStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let registryStub: sinon.SinonStub;
    let isOfficialStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      getExtensionStub = sinon.stub(extensionsApi, "getExtension");
      createSourceStub = sinon.stub(extensionsApi, "getExtensionVersion");
      registryStub = sinon.stub(resolveSource, "resolveRegistryEntry");
      registryStub.resolves(REGISTRY_ENTRY);
      isOfficialStub = sinon.stub(resolveSource, "isOfficialSource");
      isOfficialStub.returns(false);
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(REGISTRY_INSTANCE);
    });

    afterEach(() => {
      promptStub.restore();
      getExtensionStub.restore();
      createSourceStub.restore();
      registryStub.restore();
      isOfficialStub.restore();
      getInstanceStub.restore();
    });

    it("should return the correct source name for a valid published extension version source", async () => {
      promptStub.resolves(true);
      getExtensionStub.resolves(EXTENSION);
      createSourceStub.resolves(EXTENSION_VERSION);
      const name = await updateHelper.updateToVersionFromPublisherSource(
        "test-project",
        "test-instance",
        "test-publisher/test@0.2.0",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal(EXTENSION_VERSION.name);
    });

    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      getExtensionStub.throws(Error("NOT FOUND"));
      createSourceStub.throws(Error("NOT FOUND"));
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-project",
          "test-instance",
          "test-publisher/test@1.2.3",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith("NOT FOUND");
    });

    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      getExtensionStub.resolves(EXTENSION);
      createSourceStub.resolves(EXTENSION_VERSION);
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-project",
          "test-instance",
          "test-publisher/test@0.2.0",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  });

  describe("updateFromPublisherSource", () => {
    let promptStub: sinon.SinonStub;
    let getExtensionStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let registryStub: sinon.SinonStub;
    let isOfficialStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      getExtensionStub = sinon.stub(extensionsApi, "getExtension");
      createSourceStub = sinon.stub(extensionsApi, "getExtensionVersion");
      registryStub = sinon.stub(resolveSource, "resolveRegistryEntry");
      registryStub.resolves(REGISTRY_ENTRY);
      isOfficialStub = sinon.stub(resolveSource, "isOfficialSource");
      isOfficialStub.returns(false);
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(REGISTRY_INSTANCE);
    });

    afterEach(() => {
      promptStub.restore();
      getExtensionStub.restore();
      createSourceStub.restore();
      registryStub.restore();
      isOfficialStub.restore();
      getInstanceStub.restore();
    });

    it("should return the correct source name for the latest published extension source", async () => {
      promptStub.resolves(true);
      getExtensionStub.resolves(EXTENSION);
      createSourceStub.resolves(EXTENSION_VERSION);
      const name = await updateHelper.updateToVersionFromPublisherSource(
        "test-project",
        "test-instance",
        "test-publisher/test",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal(EXTENSION_VERSION.name);
    });

    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      getExtensionStub.throws(Error("NOT FOUND"));
      createSourceStub.throws(Error("NOT FOUND"));
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-project",
          "test-instance",
          "test-publisher/test",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith("NOT FOUND");
    });

    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      getExtensionStub.resolves(EXTENSION);
      createSourceStub.resolves(EXTENSION_VERSION);
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-project",
          "test-instance",
          "test-publisher/test",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  });

  describe("updateToVersionFromOfficialSource", () => {
    let promptStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let registryEntryStub: sinon.SinonStub;
    let isOfficialStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      createSourceStub = sinon.stub(extensionsApi, "getExtensionVersion");
      registryEntryStub = sinon.stub(resolveSource, "resolveRegistryEntry");
      registryEntryStub.resolves(REGISTRY_ENTRY);
      isOfficialStub = sinon.stub(resolveSource, "isOfficialSource");
      isOfficialStub.returns(true);
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(INSTANCE);
    });

    afterEach(() => {
      promptStub.restore();
      createSourceStub.restore();
      registryEntryStub.restore();
      isOfficialStub.restore();
      getInstanceStub.restore();
    });

    it("should return the correct source name for a valid published source", async () => {
      promptStub.resolves(true);
      registryEntryStub.resolves(REGISTRY_ENTRY);
      const name = await updateHelper.updateToVersionFromRegistry(
        "test-project",
        "test-instance",
        SPEC,
        SPEC.name,
        "0.1.2"
      );
      expect(name).to.equal("projects/firebasemods/sources/123");
    });

    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      registryEntryStub.throws("Unable to find extension source");
      await expect(
        updateHelper.updateToVersionFromRegistry(
          "test-project",
          "test-instance",
          SPEC,
          SPEC.name,
          "0.1.1"
        )
      ).to.be.rejectedWith(FirebaseError, "Cannot find the latest version of this extension.");
    });

    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      await expect(
        updateHelper.updateToVersionFromRegistry(
          "test-project",
          "test-instance",
          SPEC,
          SPEC.name,
          "0.1.2"
        )
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });

    it("should not update if version given less than min version required", async () => {
      await expect(
        updateHelper.updateToVersionFromRegistry(
          "test-project",
          "test-instance",
          SPEC,
          SPEC.name,
          "0.1.0"
        )
      ).to.be.rejectedWith(FirebaseError, "is less than the minimum version required");
    });
  });

  describe("updateFromOfficialSource", () => {
    let promptStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let registryEntryStub: sinon.SinonStub;
    let isOfficialStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      createSourceStub = sinon.stub(extensionsApi, "getExtensionVersion");
      registryEntryStub = sinon.stub(resolveSource, "resolveRegistryEntry");
      registryEntryStub.resolves(REGISTRY_ENTRY);
      isOfficialStub = sinon.stub(resolveSource, "isOfficialSource");
      isOfficialStub.returns(true);
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(INSTANCE);
    });

    afterEach(() => {
      promptStub.restore();
      createSourceStub.restore();
      registryEntryStub.restore();
      isOfficialStub.restore();
      getInstanceStub.restore();
    });

    it("should return the correct source name for a valid published source", async () => {
      promptStub.resolves(true);
      const name = await updateHelper.updateFromRegistry(
        "test-project",
        "test-instance",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal("projects/firebasemods/sources/abc");
    });

    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      registryEntryStub.throws("Unable to find extension source");
      await expect(
        updateHelper.updateFromRegistry("test-project", "test-instance", SPEC, SPEC.name)
      ).to.be.rejectedWith(FirebaseError, "Cannot find the latest version of this extension.");
    });

    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      registryEntryStub.resolves(REGISTRY_ENTRY);
      await expect(
        updateHelper.updateFromRegistry("test-project", "test-instance", SPEC, SPEC.name)
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  });
});
