import { expect } from "chai";
import { validateCustomTypes, validateResolvers } from "./validate";
import { CustomType } from "./types";

describe("validate", () => {
  describe("validateCustomTypes", () => {
    it("should pass valid custom type definitions", () => {
      const types: Record<string, CustomType> = {
        Time: {
          sqlType: "time",
          graphqlType: "String",
          serialize: "(time) => time.toISOString().split('T')[1]",
          parseValue: "(value) => new Date(`1970-01-01T${value}`)",
        },
      };

      const errors = validateCustomTypes(types);
      expect(errors).to.be.empty;
    });

    it("should detect missing required fields", () => {
      const types: Record<string, CustomType> = {
        Time: {
          sqlType: "time",
          graphqlType: "",
          serialize: "(time) => time",
          parseValue: "(value) => value",
        },
      };

      const errors = validateCustomTypes(types);
      expect(errors).to.have.lengthOf(1);
      expect(errors[0].message).to.include("Missing required fields");
    });

    it("should detect invalid serialize function", () => {
      const types: Record<string, CustomType> = {
        Time: {
          sqlType: "time",
          graphqlType: "String",
          serialize: "invalid { function",
          parseValue: "(value) => value",
        },
      };

      const errors = validateCustomTypes(types);
      expect(errors).to.have.lengthOf(1);
      expect(errors[0].message).to.include("Invalid serialize function");
    });

    it("should detect invalid parseValue function", () => {
      const types: Record<string, CustomType> = {
        Time: {
          sqlType: "time",
          graphqlType: "String",
          serialize: "(value) => value",
          parseValue: "invalid { function",
        },
      };

      const errors = validateCustomTypes(types);
      expect(errors).to.have.lengthOf(1);
      expect(errors[0].message).to.include("Invalid parseValue function");
    });
  });

  describe("validateResolvers", () => {
    it("should pass valid resolver definitions", () => {
      const resolvers: Record<string, string> = {
        "Query.currentTime": "(parent, args, context) => new Date().toISOString()",
      };

      const errors = validateResolvers(resolvers);
      expect(errors).to.be.empty;
    });

    it("should detect invalid resolver function", () => {
      const resolvers: Record<string, string> = {
        "Query.currentTime": "invalid { function",
      };

      const errors = validateResolvers(resolvers);
      expect(errors).to.have.lengthOf(1);
      expect(errors[0].message).to.include("Invalid resolver function");
    });

    it("should handle multiple resolvers", () => {
      const resolvers: Record<string, string> = {
        "Query.currentTime": "(parent, args) => new Date().toISOString()",
        "Mutation.setTime": "invalid { function",
        "Type.field": "(parent) => parent.field",
      };

      const errors = validateResolvers(resolvers);
      expect(errors).to.have.lengthOf(1);
      expect(errors[0].message).to.include("Mutation.setTime");
    });
  });
});