import { expect } from "chai";
import { prettify, prettifyTable } from "./graphqlError";
import { GraphqlError } from "./types";

describe("graphqlError", () => {
  describe("prettify", () => {
    it("should format a simple error", () => {
      const err: GraphqlError = {
        message: "Something went wrong",
        path: ["users", 0, "name"],
        locations: [{ line: 10, column: 2 }],
        extensions: { file: "users.gql" },
      };
      const result = prettify(err);
      expect(result).to.equal("users.gql:10: On users[0].name: Something went wrong");
    });

    it("should handle missing path", () => {
      const err: GraphqlError = {
        message: "Another issue",
        locations: [{ line: 5, column: 1 }],
        extensions: { file: "posts.gql" },
      };
      const result = prettify(err);
      expect(result).to.equal("posts.gql:5: Another issue");
    });
  });

  describe("prettifyTable", () => {
    it("should format a list of errors into a table", () => {
      const errs: GraphqlError[] = [
        {
          message: "BREAKING: A breaking change",
          path: ["users"],
          locations: [{ line: 1, column: 1 }],
          extensions: {
            file: "schema.gql",
            workarounds: [{ description: "Do this", reason: "Because", replaceWith: "That" }],
          },
        },
        {
          message: "INSECURE: An insecure change",
          path: ["posts"],
          locations: [{ line: 2, column: 2 }],
          extensions: {
            file: "schema.gql",
          },
        },
      ];
      const result = prettifyTable(errs);
      // We don't assert the exact table output due to formatting,
      // but we can check for key elements.
      expect(result).to.include("BREAKING");
      expect(result).to.include("A breaking change");
      expect(result).to.include("Do this");
      expect(result).to.include("Because");
      expect(result).to.include("INSECURE");
      expect(result).to.include("An insecure change");
    });
  });
});
