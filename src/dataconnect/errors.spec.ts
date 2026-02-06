import { expect } from "chai";
import { getIncompatibleSchemaError, getInvalidConnectors } from "./errors";

describe("errors", () => {
  describe("getIncompatibleSchemaError", () => {
    it("should return undefined if no incompatible schema error", () => {
      const err = {
        context: {
          body: {
            error: {
              details: [{ "@type": "some.other.Error" }],
            },
          },
        },
      };
      expect(getIncompatibleSchemaError(err)).to.be.undefined;
    });

    it("should extract violation type from precondition failure", () => {
      const err = {
        context: {
          body: {
            error: {
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.PreconditionFailure",
                  violations: [{ type: "INCOMPATIBLE_SCHEMA" }],
                },
                { "@type": "IncompatibleSqlSchemaError" },
              ],
            },
          },
        },
      };
      const result = getIncompatibleSchemaError(err);
      expect(result).to.not.be.undefined;
      expect(result?.violationType).to.equal("INCOMPATIBLE_SCHEMA");
    });
  });

  describe("getInvalidConnectors", () => {
    it("should return an empty array if no invalid connectors", () => {
      const err = {
        context: {
          body: {
            error: {
              details: [{ "@type": "some.other.Error" }],
            },
          },
        },
      };
      expect(getInvalidConnectors(err)).to.be.empty;
    });

    it("should extract invalid connectors from precondition failure", () => {
      const err = {
        context: {
          body: {
            error: {
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.PreconditionFailure",
                  violations: [
                    { type: "INCOMPATIBLE_CONNECTOR", subject: "users" },
                    { type: "INCOMPATIBLE_CONNECTOR", subject: "posts" },
                  ],
                },
              ],
            },
          },
        },
      };
      const result = getInvalidConnectors(err);
      expect(result).to.deep.equal(["users", "posts"]);
    });
  });
});
