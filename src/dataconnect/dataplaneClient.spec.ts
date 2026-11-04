import { expect } from "chai";
import nock from "../test/helpers/nock";
import * as chai from "chai";
import { dataconnectDataplaneClient, executeGraphQL, executeGraphQLRead } from "./dataplaneClient";
import * as types from "./types";

chai.use(require("chai-as-promised"));

describe("dataplaneClient", () => {
  const servicePath = "projects/my-project/locations/us-central1/services/my-service";

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
});
