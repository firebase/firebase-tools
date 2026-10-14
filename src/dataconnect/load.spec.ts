import { expect } from "chai";
import { inferClientCache } from "./load";
import { ConnectorYaml } from "./types";

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
});
