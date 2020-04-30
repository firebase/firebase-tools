import { expect } from "chai";

import * as mlHelper from "../../ml/mlHelper";
import Table = require("cli-table");

const PROJECT_ID = "test-project";
const MODEL_ID_1 = "123456789";
const MODEL_ID_2 = "234567980";
const MODEL_ID_3 = "345679801";

const DISPLAY_NAME_1 = "model_1";
const DISPLAY_NAME_2 = "model_2";
const DISPLAY_NAME_3 = "model_3";

const TAGS_12 = ["tag1", "tag2"];
const TAGS_123 = ["tag1", "tag2", "tag3"];
const TAGS_12_STRING = "tag1, tag2";
const TAGS_123_STRING = "tag1, tag2, tag3";

const MODEL_HASH = "modelHash123";
const ETAG = "etag123";
const CREATE_TIME = "2020-04-24T19:53:10.288047Z";
const UPDATE_TIME = "2020-04-24T19:55:26.388047Z";
const CREATE_TIME_STRING = "Fri, 24 Apr 2020 19:53:10 GMT";
const UPDATE_TIME_STRING = "Fri, 24 Apr 2020 19:55:26 GMT";

const ERROR_CODE = 9;
const ERROR_MESSAGE = "No model has been uploaded.";

const GCS_TFLITE_URI = "gs://test-project-bucket/Firebase/ML/Models/model1.tflite";
const SIZE_BYTES = 16900988;

const PUBLISHED_MODEL = {
  name: `projects/${PROJECT_ID}/models/${MODEL_ID_1}`,
  createTime: CREATE_TIME,
  updateTime: UPDATE_TIME,
  etag: ETAG,
  modelHash: MODEL_HASH,
  displayName: DISPLAY_NAME_1,
  tags: TAGS_12,
  state: { published: true },
  tfliteModel: {
    gcsTfliteUri: GCS_TFLITE_URI,
    sizeBytes: SIZE_BYTES,
  },
};

const UNPUBLISHED_MODEL = {
  name: `projects/${PROJECT_ID}/models/${MODEL_ID_2}`,
  createTime: CREATE_TIME,
  updateTime: UPDATE_TIME,
  etag: ETAG,
  modelHash: MODEL_HASH,
  displayName: DISPLAY_NAME_2,
  tags: TAGS_123,
  state: {},
  tfliteModel: {
    gcsTfliteUri: GCS_TFLITE_URI,
    sizeBytes: SIZE_BYTES,
  },
};

const INVALID_MODEL = {
  name: `projects/${PROJECT_ID}/models/${MODEL_ID_3}`,
  createTime: CREATE_TIME,
  updateTime: UPDATE_TIME,
  displayName: DISPLAY_NAME_3,
  etag: ETAG,
  state: { validationError: { code: ERROR_CODE, message: ERROR_MESSAGE } },
};

describe("mlHelper", () => {
  describe("isValidModelId", () => {
    it("should return true on valid modelId", () => {
      const modelId = "123456";
      expect(mlHelper.isValidModelId(modelId)).to.be.true;
    });

    it("should return false on invalid modelId", () => {
      const modelId = "9invalid";
      expect(mlHelper.isValidModelId(modelId)).to.be.false;
    });

    it("should return false on empty modelId", () => {
      const modelId = "";
      expect(mlHelper.isValidModelId(modelId)).to.be.false;
    });
  });

  describe("getTableForModel", () => {
    it("should return the proper table for published models", () => {
      const expectedTable = new Table(mlHelper.verticalTableFormat);
      expectedTable.push(
        { modelId: MODEL_ID_1 },
        { displayName: DISPLAY_NAME_1 },
        { tags: TAGS_12_STRING },
        { status: "Published" },
        { locked: false },
        { modelFormat: "TFLite" },
        { "modelSize (bytes)": SIZE_BYTES },
        { modelSource: GCS_TFLITE_URI },
        { createDate: CREATE_TIME_STRING },
        { updateDate: UPDATE_TIME_STRING }
      );
      expect(mlHelper.getTableForModel(PUBLISHED_MODEL)).to.deep.equal(expectedTable);
    });

    it("should return the proper table for unpublished models", () => {
      const expectedTable = new Table(mlHelper.verticalTableFormat);
      expectedTable.push(
        { modelId: MODEL_ID_2 },
        { displayName: DISPLAY_NAME_2 },
        { tags: TAGS_123_STRING },
        { status: "Ready to publish" },
        { locked: false },
        { modelFormat: "TFLite" },
        { "modelSize (bytes)": SIZE_BYTES },
        { modelSource: GCS_TFLITE_URI },
        { createDate: CREATE_TIME_STRING },
        { updateDate: UPDATE_TIME_STRING }
      );
      expect(mlHelper.getTableForModel(UNPUBLISHED_MODEL)).to.deep.equal(expectedTable);
    });

    it("should return the proper table for invalid models", () => {
      const expectedTable = new Table(mlHelper.verticalTableFormat);
      expectedTable.push(
        { modelId: MODEL_ID_3 },
        { displayName: DISPLAY_NAME_3 },
        { status: "Invalid" },
        { locked: false },
        { createDate: CREATE_TIME_STRING },
        { updateDate: UPDATE_TIME_STRING }
      );
      expect(mlHelper.getTableForModel(INVALID_MODEL)).to.deep.equal(expectedTable);
    });
  });
});
