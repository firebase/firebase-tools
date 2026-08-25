import { expect } from "chai";
import * as sinon from "sinon";

import * as extensionsApi from "./extensionsApi";
import * as replacementRegistry from "./replacementRegistry";
import { listExtensions } from "./listExtensions";

const MOCK_INSTANCES = [
  {
    name: "projects/my-test-proj/instances/image-resizer",
    createTime: "2019-05-19T00:20:10.416947Z",
    updateTime: "2019-05-19T00:20:10.416947Z",
    state: "ACTIVE",
    config: {
      extensionRef: "firebase/storage-resize-images",
      name: "projects/my-test-proj/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
      createTime: "2019-05-19T00:20:10.416947Z",
      params: {
        IMG_BUCKET: "my-test-proj.firebasestorage.app",
        IMG_SIZES: "200x200,400x400",
        DELETE_ORIGINAL_FILE: "false",
      },
      systemParams: {
        "firebaseextensions.v1beta.function/location": "us-central1",
      },
      source: {
        state: "ACTIVE",
        spec: {
          version: "0.1.0",
          author: {
            authorName: "Firebase",
            url: "https://firebase.google.com",
          },
        },
      },
    },
  },
  {
    name: "projects/my-test-proj/instances/custom-ext-1",
    createTime: "2019-06-19T00:20:10.416947Z",
    updateTime: "2019-06-19T00:21:06.722782Z",
    state: "ACTIVE",
    config: {
      extensionRef: "acme/custom-ext",
      name: "projects/my-test-proj/instances/custom-ext-1/configurations/5b1fb749-764d-4bd1-af60-bb7f22d27860",
      createTime: "2019-06-19T00:21:06.722782Z",
      params: {
        PARAM_A: "valA",
      },
      systemParams: {
        "firebaseextensions.v1beta.function/location": "us-central1",
      },
      source: {
        spec: {
          version: "1.0.0",
        },
      },
    },
  },
];

const PROJECT_ID = "my-test-proj";

describe("listExtensions", () => {
  let listInstancesStub: sinon.SinonStub;
  let getReplacementsRegistryStub: sinon.SinonStub;

  beforeEach(() => {
    listInstancesStub = sinon.stub(extensionsApi, "listInstances");
    getReplacementsRegistryStub = sinon.stub(replacementRegistry, "getReplacementsRegistry");
    getReplacementsRegistryStub.resolves({
      replacements: {
        "firebase/storage-resize-images": {
          status: "REPLACEMENT_AVAILABLE",
          npmPackage: "@firebase-function-kits/storage-resize-images",
          extensionRepositoryUrl: "https://github.com/firebase/extensions",
        },
      },
    });
  });

  afterEach(() => {
    listInstancesStub.restore();
    getReplacementsRegistryStub.restore();
  });

  it("should return an empty array if no extensions have been installed", async () => {
    listInstancesStub.returns(Promise.resolve([]));

    const result = await listExtensions(PROJECT_ID);

    expect(result).to.eql([]);
  });

  it("should return a sorted array of extension instances with replacementKit info", async () => {
    listInstancesStub.returns(Promise.resolve(MOCK_INSTANCES));

    const result = await listExtensions(PROJECT_ID);

    const expected = [
      {
        extension: "acme/custom-ext",
        instanceId: "custom-ext-1",
        publisher: "acme",
        state: "ACTIVE",
        updateTime: "2019-06-19 00:21:06",
        version: "1.0.0",
        params: {
          PARAM_A: "valA",
        },
        systemParams: {
          "firebaseextensions.v1beta.function/location": "us-central1",
        },
      },
      {
        extension: "firebase/storage-resize-images",
        instanceId: "image-resizer",
        publisher: "firebase",
        state: "ACTIVE",
        updateTime: "2019-05-19 00:20:10",
        version: "0.1.0",
        replacementKit: "@firebase-function-kits/storage-resize-images",
        params: {
          IMG_BUCKET: "my-test-proj.firebasestorage.app",
          IMG_SIZES: "200x200,400x400",
          DELETE_ORIGINAL_FILE: "false",
        },
        systemParams: {
          "firebaseextensions.v1beta.function/location": "us-central1",
        },
      },
    ];
    expect(result).to.eql(expected);
  });
});
