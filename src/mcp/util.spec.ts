import { expect } from "chai";
import { cleanSchema } from "./util";

interface TestCase {
  desc: string;
  input: Record<string, any>;
  expected: Record<string, any>;
}

const testCases: TestCase[] = [
  {
    desc: "should remove $schema property",
    input: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { name: { type: "string" } },
    },
    expected: {
      type: "object",
      properties: { name: { type: "string" } },
    },
  },
  {
    desc: "should remove additionalProperties field",
    input: {
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: false,
    },
    expected: {
      type: "object",
      properties: { name: { type: "string" } },
    },
  },
  {
    desc: "should remove additionalProperties from nested objects",
    input: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: { id: { type: "number" } },
          additionalProperties: true,
        },
        meta: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      additionalProperties: false,
    },
    expected: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: { id: { type: "number" } },
        },
        meta: {
          type: "object",
        },
      },
    },
  },
  {
    desc: "should remove top-level array type (string)",
    input: { type: "array", items: { type: "string" } },
    expected: {},
  },
  {
    desc: "should remove top-level array type (array of types including array)",
    input: { type: ["array", "string"], items: { type: "string" } }, // Will become anyOf: [{type: "string"}], then simplified to type: "string" at root
    expected: { type: "string", items: { type: "string" } },
  },
  {
    desc: "should remove top-level array type (array of types including array and null)",
    input: { type: ["array", "null"], items: { type: "string" } },
    expected: {},
  },
  {
    desc: "should remove top-level null type",
    input: { type: "null" },
    expected: {},
  },
  {
    desc: "should KEEP array type in properties",
    input: {
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" } },
        name: { type: "string" },
      },
    },
    expected: {
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" } },
        name: { type: "string" },
      },
    },
  },
  {
    desc: "should remove null type from properties",
    input: {
      type: "object",
      properties: {
        optionalField: { type: "null" },
        name: { type: "string" },
      },
    },
    expected: {
      type: "object",
      properties: { name: { type: "string" } },
    },
  },
  {
    desc: "should convert type: ['string', 'null', 'array'] to anyOf: [{type: 'string'}, {type: 'array'}] in properties",
    input: {
      type: "object",
      properties: {
        mixed: { type: ["string", "null", "array"] },
      },
    },
    expected: {
      type: "object",
      properties: {
        mixed: { anyOf: [{ type: "string" }, { type: "array" }] },
      },
    },
  },
  {
    desc: "should convert type: ['string', 'number', 'null', 'array'] to anyOf in properties",
    input: {
      type: "object",
      properties: {
        mixed: { type: ["string", "number", "null", "array"] },
      },
    },
    expected: {
      type: "object",
      properties: {
        mixed: { anyOf: [{ type: "string" }, { type: "number" }, { type: "array" }] },
      },
    },
  },
  {
    desc: "should simplify type: ['string', 'null'] to type: 'string' in properties",
    input: {
      type: "object",
      properties: {
        simpleMixed: { type: ["string", "null"] },
      },
    },
    expected: {
      type: "object",
      properties: {
        simpleMixed: { type: "string" },
      },
    },
  },
  {
    desc: "should remove property if its type array becomes empty after filtering (e.g. only null)",
    input: {
      type: "object",
      properties: {
        onlyNull: { type: ["null"] },
        name: { type: "string" },
      },
    },
    expected: {
      type: "object",
      properties: { name: { type: "string" } },
    },
  },
  {
    desc: "should keep property if its type array contains only 'array' (not root) and simplify",
    input: {
      type: "object",
      properties: {
        onlyArray: { type: ["array", "null"] },
        name: { type: "string" },
      },
    },
    expected: {
      type: "object",
      properties: {
        onlyArray: { type: "array" },
        name: { type: "string" },
      },
    },
  },
  {
    desc: "should handle nested objects and clean them (arrays kept in nested, type arrays become anyOf or simplified)",
    input: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: { type: "number" },
            tags: { type: "array", items: { type: "string" } },
            status: { type: ["string", "integer", "null"] },
            maybeName: { type: ["string", "null"] },
          },
        },
      },
    },
    expected: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: { type: "number" },
            tags: { type: "array", items: { type: "string" } },
            status: { anyOf: [{ type: "string" }, { type: "integer" }] },
            maybeName: { type: "string" },
          },
        },
      },
    },
  },
  {
    desc: "should remove items if its schema becomes null",
    input: {
      type: "object",
      properties: {
        someObjectWithItems: {
          type: "object",
          items: { type: "null" },
        },
      },
    },
    expected: {
      type: "object",
      properties: {
        someObjectWithItems: {
          type: "object",
        },
      },
    },
  },
  {
    desc: "should clean definitions ($defs), convert type arrays to anyOf/simplified",
    input: {
      type: "object",
      properties: {
        myDef: { $ref: "#/$defs/invalidDef" },
        myValidDef: { $ref: "#/$defs/validDefWithArray" },
        myComplexDef: { $ref: "#/$defs/complexDef" },
      },
      $defs: {
        invalidDef: { type: "null" },
        validDef: { type: "string" },
        validDefWithArray: { type: "array", items: { type: "number" } },
        complexDef: { type: ["boolean", "string", "null"] },
      },
    },
    expected: {
      type: "object",
      properties: {
        myDef: { $ref: "#/$defs/invalidDef" },
        myValidDef: { $ref: "#/$defs/validDefWithArray" },
        myComplexDef: { $ref: "#/$defs/complexDef" },
      },
      $defs: {
        validDef: { type: "string" },
        validDefWithArray: { type: "array", items: { type: "number" } },
        complexDef: { anyOf: [{ type: "boolean" }, { type: "string" }] },
      },
    },
  },
  {
    desc: "should remove $defs if all definitions become invalid (e.g. all null)",
    input: {
      type: "object",
      $defs: {
        invalidDef1: { type: "null" },
        invalidDef2: { type: "null" },
      },
    },
    expected: {
      type: "object",
    },
  },
  {
    desc: "should clean schema arrays (anyOf, allOf, oneOf), keep nested arrays, convert internal type arrays",
    input: {
      anyOf: [
        { type: "string" },
        { type: "array", items: { type: "number" } },
        { type: "null" },
        { type: ["integer", "boolean", "null"] },
      ],
      allOf: [{ type: "number" }],
      oneOf: [{ type: "boolean" }, { type: ["null", "array"] }],
    },
    expected: {
      anyOf: [
        { type: "string" },
        { type: "array", items: { type: "number" } },
        { anyOf: [{ type: "integer" }, { type: "boolean" }] },
      ],
      allOf: [{ type: "number" }],
      oneOf: [{ type: "boolean" }, { type: "array" }],
    },
  },
  {
    desc: "should remove schema array keywords if their arrays become empty (e.g. all null)",
    input: {
      anyOf: [{ type: "null" }, { type: "null" }],
      description: "test",
    },
    expected: {
      description: "test",
    },
  },
  {
    desc: "should return an empty object if the entire schema is just { type: 'array' }",
    input: { type: "array" },
    expected: {},
  },
  {
    desc: "should return an empty object if the entire schema is just { type: 'null' }",
    input: { type: "null" },
    expected: {},
  },
  {
    desc: "should return an empty object if the entire schema is { type: ['null', 'array'] }",
    input: { type: ["null", "array"] },
    expected: {},
  },
  {
    desc: "should not modify a schema that is already clean (with nested array and anyOf)",
    input: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        scores: { type: "array", items: { type: "number" } },
        choice: { anyOf: [{ type: "string" }, { type: "boolean" }] },
      },
      required: ["name"],
    },
    expected: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        scores: { type: "array", items: { type: "number" } },
        choice: { anyOf: [{ type: "string" }, { type: "boolean" }] },
      },
      required: ["name"],
    },
  },
  {
    desc: "should handle deeply nested structures with various cleaning needs (arrays kept if not root, type arrays to anyOf)",
    input: {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "Complex Test",
      type: "object", // Top level type array: ["object", "null"] -> type: "object"
      additionalProperties: false,
      properties: {
        validProp: { type: "string" },
        propToBeKept: { type: "array", items: { type: "number" } },
        objectWithMixedTypes: {
          type: "object",
          additionalProperties: true,
          properties: {
            subPropString: { type: "string" },
            subPropNull: { type: "null" },
            subPropArrayType: { type: ["integer", "null", "array", "string"] },
          },
        },
        anotherArrayProp: { type: "array", items: { type: "boolean" } },
      },
      $defs: {
        reusableInvalid: { type: "null" },
        reusableValid: {
          type: "object",
          additionalProperties: { type: "string" },
          properties: {
            detail: { type: "string" },
            unwantedList: { type: "array", items: { type: "string" } },
            statusOptions: { type: ["number", "string", "null"] },
          },
        },
        toBeEmptyDef: { type: "null" },
      },
      anyOf: [
        // This anyOf is at the root level of the input schema, but its subschemas are not "root" for cleaning
        { type: "string" },
        { type: "array", items: { type: "object" } }, // This array is fine as it's not top-level schema type
        { $ref: "#/$defs/reusableInvalid" },
        { type: ["boolean", "null", "integer"] },
      ],
    },
    expected: {
      title: "Complex Test",
      type: "object",
      properties: {
        validProp: { type: "string" },
        propToBeKept: { type: "array", items: { type: "number" } },
        objectWithMixedTypes: {
          type: "object",
          properties: {
            subPropString: { type: "string" },
            subPropArrayType: {
              anyOf: [{ type: "integer" }, { type: "array" }, { type: "string" }],
            },
          },
        },
        anotherArrayProp: { type: "array", items: { type: "boolean" } },
      },
      $defs: {
        reusableValid: {
          type: "object",
          properties: {
            detail: { type: "string" },
            unwantedList: { type: "array", items: { type: "string" } },
            statusOptions: { anyOf: [{ type: "number" }, { type: "string" }] },
          },
        },
      },
      anyOf: [
        { type: "string" },
        { type: "array", items: { type: "object" } },
        { anyOf: [{ type: "boolean" }, { type: "integer" }] },
      ],
    },
  },
  {
    desc: "should remove properties if properties object becomes empty (all null)",
    input: {
      type: "object",
      properties: {
        field1: { type: "null" },
        field2: { type: "null" },
      },
    },
    expected: {
      type: "object",
    },
  },
  {
    desc: "top level schema with type: ['string', 'array'] should become type: 'string'",
    input: {
      type: ["string", "array"], // 'array' removed at root, 'string' remains
      description: "Test",
    },
    expected: {
      type: "string",
      description: "Test",
    },
  },
  {
    desc: "top level schema with type: ['string', 'number', 'array'] should become anyOf: [{type: string}, {type: number}]",
    input: {
      type: ["string", "number", "array"], // 'array' removed at root
      description: "Test AnyOf Root",
    },
    expected: {
      anyOf: [{ type: "string" }, { type: "number" }],
      description: "Test AnyOf Root",
    },
  },
];

describe("cleanSchema", () => {
  testCases.forEach((tc) => {
    it(tc.desc, () => {
      expect(cleanSchema(tc.input)).to.deep.equal(tc.expected);
    });
  });
});
