import { z } from "zod";

export const FieldReference = z.object({
  fieldPath: z
    .string()
    .describe("A reference to a field in a document. e.g. field, field.nested_field"),
});

export const Value = z
  .union([
    z.object({ nullValue: z.null() }),
    z.object({ booleanValue: z.boolean() }),
    z.object({ integerValue: z.string().describe("A 64 bit int") }),
    z.object({ doubleValue: z.number() }),
    z.object({
      timestampValue: z.string().describe(
        `Uses RFC 3339, where generated output will always be Z-normalized and uses 0, 3, 6 or 9 fractional digits. 
		   Offsets other than "Z" are also accepted. 
		   Examples: "2014-10-02T15:01:23Z", "2014-10-02T15:01:23.045123456Z" or "2014-10-02T15:01:23+05:30".`,
      ),
    }),
    z.object({ stringValue: z.string() }),
    z.object({ bytesValue: z.string().describe("A base64-encoded string.") }),
  ])
  .describe("A firestore value. Only one value field can be set per value object.");

// Recursive types are not supported so we define the array value separately.
export const ArrayValue = z.object({ arrayValue: z.object({ values: Value.array() }) });

export const UnaryFilter = z.object({
  op: z.enum(["IS_NAN", "IS_NULL", "IS_NOT_NAN", "IS_NOT_NULL"]),
  field: FieldReference,
});

export const FieldFilter = z.object({
  field: FieldReference,
  op: z.enum([
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL",
    "EQUAL",
    "NOT_EQUAL",
    "ARRAY_CONTAINS",
    "IN",
    "ARRAY_CONTAINS_ANY",
    "NOT_IN",
  ]),
  value: z.union([Value, ArrayValue]),
});

export const Filter = z.object({
  unaryFilter: UnaryFilter.optional(),
  fieldFilter: FieldFilter.optional(),
}).describe("Only one filter field can be set per filter object.");

// Recursive types are not supported so we define the composite filter separately.
export const CompositeFilter = z.object({
  op: z.enum(["AND", "OR"]),
  filters: Filter.array(),
});

export const Order = z.object({
  field: FieldReference.describe("The field to order by."),
  direction: z.enum(["ASCENDING", "DESCENDING"]).describe("The direction to order by."),
});
