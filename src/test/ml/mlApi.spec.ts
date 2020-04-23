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
});
