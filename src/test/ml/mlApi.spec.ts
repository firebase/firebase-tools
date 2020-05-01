import * as _ from "lodash";
import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import * as helpers from "../helpers";
import * as api from "../../api";
import { FirebaseError } from "../../error";

import * as mlApi from "../../ml/mlApi";
import { ModelsPage } from "../../ml/models";

const VERSION = "v1beta2";

const PROJECT_ID = "test-project";
const MODEL_ID_1 = "123456789";
const MODEL_ID_2 = "234567890";

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

const MODEL_2_RESPONSE = {
  name: `projects/${PROJECT_ID}/models/${MODEL_ID_2}`,
  createTime: "2020-02-07T22:45:23.288047Z",
  updateTime: "2020-02-08T22:45:23.288047Z",
  etag: "etag234",
  modelHash: "modelHash234",
  displayName: "model_2",
  tags: ["tag_2", "tag_3"],
  state: {},
  tfliteModel: {
    gcsTfliteUri: "gs://test-project-bucket/Firebase/ML/Models/model2.tflite",
    sizeBytes: 26900988,
  },
};

const MODEL_FILTER_STRING = "filter1";

const MODEL_LIST_RESPONSE: ModelsPage = {
  models: [MODEL_1_RESPONSE, MODEL_2_RESPONSE],
};

const MODEL_LIST_RESPONSE_WITH_NEXT_PAGE: ModelsPage = _.cloneDeep(MODEL_LIST_RESPONSE);
MODEL_LIST_RESPONSE_WITH_NEXT_PAGE.nextPageToken = "abc123";

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

  describe("listModels", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should return a list of models", async () => {
      nock(api.mlOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/models`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query((queryParams: any) => {
          return queryParams.pageSize === "100";
        })
        .reply(200, MODEL_LIST_RESPONSE);

      const options = {};
      const models = await mlApi.listModels(PROJECT_ID, options);

      expect(models).to.deep.equal(MODEL_LIST_RESPONSE.models);
      expect(nock.isDone()).to.be.true;
    });

    it("should query for more models if the response has a next_page_token", async () => {
      nock(api.mlOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/models`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query((queryParams: any) => {
          return queryParams.pageSize === "100";
        })
        .reply(200, MODEL_LIST_RESPONSE_WITH_NEXT_PAGE);
      nock(api.mlOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/models`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query((queryParams: any) => {
          return queryParams.pageToken === "abc123";
        })
        .reply(200, MODEL_LIST_RESPONSE);

      const options = {};
      const models = await mlApi.listModels(PROJECT_ID, options);

      const expected = MODEL_LIST_RESPONSE.models.concat(MODEL_LIST_RESPONSE_WITH_NEXT_PAGE.models);
      expect(models).to.deep.equal(expected);
      expect(nock.isDone()).to.be.true;
    });

    it("should pass the filter parameter from options", async () => {
      nock(api.mlOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/models`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query((queryParams: any) => {
          return queryParams.filter === MODEL_FILTER_STRING;
        })
        .reply(200, MODEL_LIST_RESPONSE);

      const options = {
        filter: MODEL_FILTER_STRING,
      };
      const models = await mlApi.listModels(PROJECT_ID, options);

      expect(models).to.deep.equal(MODEL_LIST_RESPONSE.models);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw FirebaseError if any call returns an error", async () => {
      nock(api.mlOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/models`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query((queryParams: any) => {
          return queryParams.pageSize === "100";
        })
        .reply(200, MODEL_LIST_RESPONSE_WITH_NEXT_PAGE);
      nock(api.mlOrigin)
        .get(`/${VERSION}/projects/${PROJECT_ID}/models`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query((queryParams: any) => {
          return queryParams.pageToken === "abc123";
        })
        .reply(503);

      const options = {};
      await expect(mlApi.listModels(PROJECT_ID, options)).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });
  });
});
