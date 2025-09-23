import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { FirebaseError } from "../error";
import { firebaseExtensionsRegistryOrigin } from "../api";
import * as extensionsApi from "./extensionsApi";
import {
  ExtensionInstance,
  ExtensionInstanceState,
  ExtensionSource,
  ExtensionSpec,
  Resource,
} from "./types";
import * as extensionsHelper from "./extensionsHelper";
import * as updateHelper from "./updateHelper";
import * as iam from "../gcp/iam";

const SPEC: ExtensionSpec = {
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
    { name: "resource2", type: "other", description: "" } as unknown as Resource,
  ],
  author: { authorName: "Tester" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
  systemParams: [],
};

const SOURCE: ExtensionSource = {
  state: "ACTIVE",
  name: "projects/firebasemods/sources/new-test-source",
  packageUri: "https://firebase-fake-bucket.com",
  hash: "1234567",
  spec: SPEC,
};

const INSTANCE: ExtensionInstance = {
  name: "projects/invader-zim/instances/instance-of-official-ext",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE" as ExtensionInstanceState,
  config: {
    name: "projects/invader-zim/instances/instance-of-official-ext/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    source: {
      ...SOURCE,
      name: "projects/firebasemods/sources/fake-official-source",
    },
    params: {},
    systemParams: {},
  },
  serviceAccountEmail: "name@org.com",
};

const REGISTRY_INSTANCE: ExtensionInstance = {
  name: "projects/invader-zim/instances/instance-of-registry-ext",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE" as ExtensionInstanceState,
  serviceAccountEmail: "name@org.com",
  config: {
    name: "projects/invader-zim/instances/instance-of-registry-ext/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    extensionRef: "test-publisher/test",
    source: {
      ...SOURCE,
      name: "projects/firebasemods/sources/fake-registry-source",
    },
    params: {},
    systemParams: {},
  },
};

const LOCAL_INSTANCE: ExtensionInstance = {
  name: "projects/invader-zim/instances/instance-of-local-ext",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE" as ExtensionInstanceState,
  serviceAccountEmail: "name@org.com",
  config: {
    name: "projects/invader-zim/instances/instance-of-local-ext/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    source: {
      ...SOURCE,
      name: "projects/firebasemods/sources/fake-local-source",
    },
    params: {},
    systemParams: {},
  },
};

describe("updateHelper", () => {
  describe("updateFromLocalSource", () => {
    let createSourceStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;
    let getRoleStub: sinon.SinonStub;
    beforeEach(() => {
      createSourceStub = sinon.stub(extensionsHelper, "createSourceFromLocation");
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(INSTANCE);
      getRoleStub = sinon.stub(iam, "getRole");
      getRoleStub.resolves({
        title: "Role 1",
        description: "a role",
      });
      // The logic will fetch the extensions registry, but it doesn't need to receive anything.
      nock(firebaseExtensionsRegistryOrigin()).get("/extensions.json").reply(200, {});
    });

    afterEach(() => {
      createSourceStub.restore();
      getInstanceStub.restore();
      getRoleStub.restore();

      nock.cleanAll();
    });

    it("should return the correct source name for a valid local source", async () => {
      createSourceStub.resolves(SOURCE);
      const name = await updateHelper.updateFromLocalSource(
        "test-project",
        "test-instance",
        ".",
        SPEC,
      );
      expect(name).to.equal(SOURCE.name);
    });

    it("should throw an error for an invalid source", async () => {
      createSourceStub.throwsException("Invalid source");
      await expect(
        updateHelper.updateFromLocalSource("test-project", "test-instance", ".", SPEC),
      ).to.be.rejectedWith(FirebaseError, "Unable to update from the source");
    });
  });

  describe("updateFromUrlSource", () => {
    let createSourceStub: sinon.SinonStub;
    let getInstanceStub: sinon.SinonStub;
    let getRoleStub: sinon.SinonStub;
    beforeEach(() => {
      createSourceStub = sinon.stub(extensionsHelper, "createSourceFromLocation");
      getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(INSTANCE);
      getRoleStub = sinon.stub(iam, "getRole");
      getRoleStub.resolves({
        title: "Role 1",
        description: "a role",
      });
      // The logic will fetch the extensions registry, but it doesn't need to receive anything.
      nock(firebaseExtensionsRegistryOrigin()).get("/extensions.json").reply(200, {});
    });

    afterEach(() => {
      createSourceStub.restore();
      getInstanceStub.restore();
      getRoleStub.restore();

      nock.cleanAll();
    });

    it("should return the correct source name for a valid url source", async () => {
      createSourceStub.resolves(SOURCE);
      const name = await updateHelper.updateFromUrlSource(
        "test-project",
        "test-instance",
        "https://valid-source.tar.gz",
        SPEC,
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
          SPEC,
        ),
      ).to.be.rejectedWith(FirebaseError, "Unable to update from the source");
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
      "firebase/storage-resize-images",
    );
    expect(result).to.equal("firebase/storage-resize-images@latest");
  });

  it("should infer update source if it is a ref distinct from the input ref", () => {
    const result = updateHelper.inferUpdateSource(
      "notfirebase/storage-resize-images",
      "firebase/storage-resize-images",
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
    );

    expect(result).to.equal(extensionsHelper.SourceOrigin.PUBLISHED_EXTENSION);
  });

  it("should return local extension as source origin", async () => {
    getInstanceStub = sinon.stub(extensionsApi, "getInstance").resolves(LOCAL_INSTANCE);

    const result = await updateHelper.getExistingSourceOrigin(
      "invader-zim",
      "instance-of-local-ext",
    );

    expect(result).to.equal(extensionsHelper.SourceOrigin.LOCAL);
  });
});
