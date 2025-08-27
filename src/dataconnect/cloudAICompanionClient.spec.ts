import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as chai from "chai";
import { callCloudAICompanion, cloudAICompationClient } from "./cloudAICompanionClient";
import { Client } from "../apiv2";
import { CallCloudAiCompanionRequest, CloudAICompanionResponse } from "./cloudAICompanionTypes";

chai.use(require("chai-as-promised"));

describe("cloudAICompanionClient", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("callCloudAICompanion", () => {
    const fakeRequest: CallCloudAiCompanionRequest = {
      servicePath: "projects/my-project/locations/us-central1/services/my-service",
      naturalLanguageQuery: "Get all users",
      chatHistory: [],
    };

    it("should call the Cloud AI Companion API for schema generation", async () => {
      const expectedResponse: CloudAICompanionResponse = {
        output: {
          messages: [{ author: "MODEL", content: "Generated schema" }],
        },
      };
      nock("https://cloudaicompanion.googleapis.com")
        .post("/v1/projects/my-project/locations/global/instances/default:completeTask", (body) => {
          expect(body.experienceContext.experience).to.equal(
            "/appeco/firebase/fdc-schema-generator",
          );
          return true;
        })
        .reply(200, expectedResponse);

      const client = cloudAICompationClient();
      const response = await callCloudAICompanion(client, fakeRequest, "schema");
      expect(response).to.deep.equal(expectedResponse);
    });

    it("should call the Cloud AI Companion API for operation generation", async () => {
      const expectedResponse: CloudAICompanionResponse = {
        output: {
          messages: [{ author: "MODEL", content: "Generated operation" }],
        },
      };
      nock("https://cloudaicompanion.googleapis.com")
        .post("/v1/projects/my-project/locations/global/instances/default:completeTask", (body) => {
          expect(body.experienceContext.experience).to.equal(
            "/appeco/firebase/fdc-query-generator",
          );
          return true;
        })
        .reply(200, expectedResponse);

      const client = cloudAICompationClient();
      const response = await callCloudAICompanion(client, fakeRequest, "operation");
      expect(response).to.deep.equal(expectedResponse);
    });

    it("should handle errors from the Cloud AI Companion API", async () => {
      nock("https://cloudaicompanion.googleapis.com")
        .post("/v1/projects/my-project/locations/global/instances/default:completeTask")
        .reply(500, { error: { message: "Internal Server Error" } });

      const client = cloudAICompationClient();
      const response = await callCloudAICompanion(client, fakeRequest, "schema");

      expect(response.error).to.exist;
      expect(response.output.messages).to.deep.equal([]);
    });

    it("should throw an error for an invalid service name", async () => {
      const invalidRequest: CallCloudAiCompanionRequest = {
        servicePath: "invalid-service-name",
        naturalLanguageQuery: "Get all users",
        chatHistory: [],
      };
      const client = new Client({ urlPrefix: "", apiVersion: "" });
      await expect(callCloudAICompanion(client, invalidRequest, "schema")).to.be.rejectedWith(
        "Invalid service name: invalid-service-name",
      );
    });
  });
});
