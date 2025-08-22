import { expect } from "chai";
import * as converter from "./converter";
import {
  Schema,
  Connector,
  GraphqlResponse,
  GraphqlResponseError,
} from "../../../dataconnect/types";

describe("dataconnect converter", () => {
  describe("schemaToText", () => {
    it("should format a schema to text", () => {
      const schema: Schema = {
        name: "my-schema",
        datasources: [{ postgresql: { database: "db1" } }],
        source: { files: [{ path: "schema.gql", content: "type Query { hello: String }" }] },
      };
      const result = converter.schemaToText(schema);
      expect(result).to.include("name: my-schema");
      expect(result).to.include("datasources:");
      expect(result).to.include("postgresql:");
      expect(result).to.include("# schema.gql");
      expect(result).to.include("```graphql");
      expect(result).to.include("type Query { hello: String }");
    });
  });

  describe("connectorToText", () => {
    it("should format a connector to text", () => {
      const connector: Connector = {
        name: "my-connector",
        source: { files: [{ path: "connector.yaml", content: "name: my-connector" }] },
      };
      const result = converter.connectorToText(connector);
      expect(result).to.include("name: my-connector");
      expect(result).to.include("# connector.yaml");
    });
  });

  describe("graphqlResponseToToolResponse", () => {
    it("should handle a successful response", () => {
      const response: GraphqlResponse = { data: { hello: "world" }, errors: [] };
      const result = converter.graphqlResponseToToolResponse(response);
      expect(result.isError).to.be.false;
      expect(result.content[0].text).to.equal(JSON.stringify(response, null, 2));
    });

    it("should handle a response with errors", () => {
      const response: GraphqlResponse = {
        data: null,
        errors: [{ message: "An error occurred" }],
      };
      const result = converter.graphqlResponseToToolResponse(response);
      expect(result.isError).to.be.true;
      expect(result.content[0].text).to.include("A GraphQL error occurred");
    });

    it("should handle a non-graphql response error", () => {
      const error: GraphqlResponseError = {
        error: { code: 500, message: "system error", status: "INTERNAL", details: [] },
      };
      const result = converter.graphqlResponseToToolResponse(error);
      expect(result.isError).to.be.true;
      expect(result.content[0].text).to.include("system error");
    });
  });

  describe("parseVariables", () => {
    it("should parse a valid JSON string", () => {
      const result = converter.parseVariables('{"key": "value"}');
      expect(result).to.deep.equal({ key: "value" });
    });

    it("should return an empty object for undefined input", () => {
      const result = converter.parseVariables(undefined);
      expect(result).to.deep.equal({});
    });

    it("should throw an error for invalid JSON", () => {
      expect(() => converter.parseVariables("invalid-json")).to.throw(
        "Provided variables string `invalid-json` is not valid JSON.",
      );
    });

    it("should throw an error for non-object JSON", () => {
      expect(() => converter.parseVariables('"string"')).to.throw(
        'Provided variables string `"string"` is not valid JSON.',
      );
    });
  });
});
