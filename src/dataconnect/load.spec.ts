import { expect } from "chai";
import { inferClientCache, readFirebaseJson, squashGraphQL } from "./load";
import { ConnectorYaml, Source } from "./types";
import { Config } from "../config";
import * as sinon from "sinon";

describe("dataconnect/load", () => {
  describe("inferClientCache", () => {
    it("should return undefined if no clientCache is present in any SDK", () => {
      const connectorYaml: ConnectorYaml = {
        connectorId: "my-connector",
        generate: {
          javascriptSdk: {
            outputDir: "./js",
            package: "@my/pkg",
          },
        },
      };

      const result = inferClientCache(connectorYaml);
      expect(result).to.be.undefined;
    });

    it("should return undefined if generate is missing", () => {
      const connectorYaml: ConnectorYaml = {
        connectorId: "my-connector",
      };

      const result = inferClientCache(connectorYaml);
      expect(result).to.be.undefined;
    });

    const expectedCache = {
      strict_validation_enabled: true,
      entity_id_included: true,
    };

    const sdkPlatforms = ["javascriptSdk", "swiftSdk", "kotlinSdk", "dartSdk"] as const;

    for (const sdk of sdkPlatforms) {
      it(`should return inferred cache if ${sdk} has clientCache`, () => {
        const connectorYaml: ConnectorYaml = {
          connectorId: "my-connector",
          generate: {
            [sdk]: {
              outputDir: `./${sdk}`,
              package: "my-pkg",
              clientCache: {},
            },
          },
        };

        const result = inferClientCache(connectorYaml);
        expect(result).to.deep.equal(expectedCache);
      });
    }

    it("should work with multiple SDKs in an array", () => {
      const connectorYaml: ConnectorYaml = {
        connectorId: "my-connector",
        generate: {
          javascriptSdk: [
            {
              outputDir: "./js1",
              package: "@my/pkg1",
            },
            {
              outputDir: "./js2",
              package: "@my/pkg2",
              clientCache: {},
            },
          ],
        },
      };

      const result = inferClientCache(connectorYaml);
      expect(result).to.deep.equal(expectedCache);
    });

    it("should return undefined if all SDKs have clientCache missing", () => {
      const connectorYaml: ConnectorYaml = {
        connectorId: "my-connector",
        generate: {
          javascriptSdk: { outputDir: "./js", package: "@my/pkg" },
          swiftSdk: { outputDir: "./swift", package: "MyPkg" },
          kotlinSdk: { outputDir: "./kotlin", package: "com.my.pkg" },
          dartSdk: { outputDir: "./dart", package: "my_pkg" },
        },
      };

      const result = inferClientCache(connectorYaml);
      expect(result).to.be.undefined;
    });

    it("should return undefined if clientCache is null (YAML key present but no value)", () => {
      const connectorYaml: ConnectorYaml = {
        connectorId: "my-connector",
        generate: {
          javascriptSdk: {
            outputDir: "./js",
            package: "@my/pkg",
            clientCache: null as any,
          },
        },
      };

      const result = inferClientCache(connectorYaml);
      expect(result).to.be.undefined;
    });
  });

  describe("readFirebaseJson", () => {
    it("should return empty array if config has no dataconnect key", () => {
      const config = new Config({}, {});
      const result = readFirebaseJson(config);
      expect(result).to.deep.equal([]);
    });

    it("should parse single object dataconnect config", () => {
      const config = new Config({ dataconnect: { source: "dataconnect" } }, {});
      const result = readFirebaseJson(config);
      expect(result).to.deep.equal([{ source: "dataconnect" }]);
    });

    it("should parse array dataconnect config", () => {
      const config = new Config({ dataconnect: [{ source: "dir1" }, { source: "dir2" }] }, {});
      const result = readFirebaseJson(config);
      expect(result).to.deep.equal([{ source: "dir1" }, { source: "dir2" }]);
    });

    it("should throw if source is missing", () => {
      const config = new Config({ dataconnect: { wrong: "key" } }, {});
      expect(() => readFirebaseJson(config)).to.throw(/requires `source`/);
    });

    it("should throw if dataconnect is neither object nor array", () => {
      const config = new Config({}, {});
      sinon.stub(config, "has").returns(true);
      sinon.stub(config, "get").returns("invalid string");

      expect(() => readFirebaseJson(config)).to.throw(/should be of the form/);
    });
  });

  describe("squashGraphQL", () => {
    it("should return empty string for empty source", () => {
      const source: Source = { files: [] };
      expect(squashGraphQL(source)).to.equal("");
    });

    it("should return single file content without headers", () => {
      const source: Source = { files: [{ path: "schema.gql", content: "type User {}" }] };
      expect(squashGraphQL(source)).to.equal("type User {}");
    });

    it("should delimit multiple files with comments", () => {
      const source: Source = {
        files: [
          { path: "a.gql", content: "type A {}" },
          { path: "b.gql", content: "type B {}" },
        ],
      };
      const expected =
        "### Begin file a.gql\ntype A {}### End file a.gql\n### Begin file b.gql\ntype B {}### End file b.gql\n";
      expect(squashGraphQL(source)).to.equal(expected);
    });

    it("should skip empty files during squash", () => {
      const source: Source = {
        files: [
          { path: "a.gql", content: "type A {}" },
          { path: "b.gql", content: "   " },
        ],
      };
      const expected = "### Begin file a.gql\ntype A {}### End file a.gql\n";
      expect(squashGraphQL(source)).to.equal(expected);
    });
  });
});
