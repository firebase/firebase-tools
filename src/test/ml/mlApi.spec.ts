import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import * as helpers from "../helpers";
import * as api from "../../api";
import { FirebaseError } from "../../error";

import * as mlApi from "../../ml/mlApi";

const VERSION = "v1beta2";

const PROJECT_ID = "test-project";
const MODEL_ID_1 = "123456789";

const MODEL_1_RESPONSE = {
  name: `projects/${PROJECT_ID}/models/${MODEL_ID_1}`,
  createTime: "2020-02-07T23:45:23.288047Z",
  updateTime: "2020-02-08T23:45:23.288047Z",
  etag: "etag123",
  modelHash: "modelHash123",
  displayName: "model_1",
  tags: ["tag_1", "tag_2"],
  state: { published: true },
  tfliteModel: {
    gcsTfliteUri: "gs://test-project-bucket/Firebase/ML/Models/model1.tflite",
    sizeBytes: 16900988,
  },
};

describe("mlApi", () => {
  beforeEach(() => {
    helpers.mockAuth(sinon);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("deleteModel", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a DELETE call to the correct endpoint", async () => {
      nock(api.mlOrigin)
        .delete(`/${VERSION}/projects/${PROJECT_ID}/models/${MODEL_ID_1}`)
        .reply(200, {});
      await mlApi.deleteModel(PROJECT_ID, MODEL_ID_1);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if delete returns an error response", async () => {
      nock(api.mlOrigin)
        .delete(`/${VERSION}/projects/${PROJECT_ID}/models/${MODEL_ID_1}`)
        .reply(404);

      await expect(mlApi.deleteModel(PROJECT_ID, MODEL_ID_1)).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getModel", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should make a GET call to the correct endpoint", async () => {
      nock(api.mlOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/models/${MODEL_ID_1}`)
        .reply(200, MODEL_1_RESPONSE);
      const model = await mlApi.getModel(PROJECT_ID, MODEL_ID_1);
      expect(model).to.deep.equal(MODEL_1_RESPONSE);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if get returns an error response", async () => {
      nock(api.mlOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/models/${MODEL_ID_1}`)
        .reply(404);

      await expect(mlApi.getModel(PROJECT_ID, MODEL_ID_1)).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });
  });
});
