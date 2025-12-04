import { expect } from "chai";
import nock from "nock";
import * as chai from "chai";
import {
  dataconnectDataplaneClient,
  executeGraphQL,
  executeGraphQLRead,
  executeGraphQLQuery,
  executeGraphQLMutation,
} from "./dataplaneClient";
import * as types from "./types";

chai.use(require("chai-as-promised"));

describe("dataplaneClient", () => {
  const servicePath = "projects/my-project/locations/us-central1/services/my-service";
  const connectorPath = `${servicePath}/connectors/my-connector`;

  afterEach(() => {
    nock.cleanAll();
  });

  describe("executeGraphQL", () => {
    it("should make a POST request to the executeGraphql endpoint", async () => {
      const requestBody: types.ExecuteGraphqlRequest = {
        query: "query { users { id } }",
      };
      const expectedResponse = { data: { users: [{ id: "1" }] } };
      nock("https://firebasedataconnect.googleapis.com")
        .post(`/v1/${servicePath}:executeGraphql`, (body) => body.query === requestBody.query)
        .reply(200, expectedResponse);

      const client = dataconnectDataplaneClient();
      const response = await executeGraphQL(client, servicePath, requestBody);

      expect(response.body).to.deep.equal(expectedResponse);
    });
  });

  describe("executeGraphQLRead", () => {
    it("should make a POST request to the executeGraphqlRead endpoint", async () => {
      const requestBody: types.ExecuteGraphqlRequest = {
        query: "query { users { id } }",
      };
      const expectedResponse = { data: { users: [{ id: "1" }] } };
      nock("https://firebasedataconnect.googleapis.com")
        .post(`/v1/${servicePath}:executeGraphqlRead`, (body) => body.query === requestBody.query)
        .reply(200, expectedResponse);

      const client = dataconnectDataplaneClient();
      const response = await executeGraphQLRead(client, servicePath, requestBody);

      expect(response.body).to.deep.equal(expectedResponse);
    });
  });

  describe("executeGraphQLQuery", () => {
    it("should make a POST request to the executeQuery endpoint", async () => {
      const requestBody: types.ExecuteOperationRequest = {
        operationName: "getUsers",
      };
      const expectedResponse = { data: { users: [{ id: "1" }] } };
      nock("https://firebasedataconnect.googleapis.com")
        .post(
          `/v1/${connectorPath}:executeQuery`,
          (body) => body.operationName === requestBody.operationName,
        )
        .reply(200, expectedResponse);

      const client = dataconnectDataplaneClient();
      const response = await executeGraphQLQuery(client, connectorPath, requestBody);

      expect(response.body).to.deep.equal(expectedResponse);
    });
  });

  describe("executeGraphQLMutation", () => {
    it("should make a POST request to the executeMutation endpoint", async () => {
      const requestBody: types.ExecuteOperationRequest = {
        operationName: "createUser",
      };
      const expectedResponse = { data: { createUser: { id: "1" } } };
      nock("https://firebasedataconnect.googleapis.com")
        .post(
          `/v1/${connectorPath}:executeMutation`,
          (body) => body.operationName === requestBody.operationName,
        )
        .reply(200, expectedResponse);

      const client = dataconnectDataplaneClient();
      const response = await executeGraphQLMutation(client, connectorPath, requestBody);

      expect(response.body).to.deep.equal(expectedResponse);
    });
  });
});
