import assert from "assert";
import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLEnumType,
  print,
  GraphQLInputField,
} from "graphql";
import { makeAdHocMutation } from "../../../../data-connect/ad-hoc-mutations";
import { firebaseSuite } from "../../../utils/test_hooks";

firebaseSuite("makeAdHocMutation", () => {
  // The `makeAdHocMutation` function expects an array of `GraphQLInputField` objects.
  // We create plain objects that conform to the structure of `GraphQLInputField` for our tests.
  const mockFields = {
    string: {
      name: "field1",
      type: GraphQLString,
      description: "",
      defaultValue: null,
      extensions: {},
      isDeprecated: false,
      deprecationReason: null,
      astNode: undefined,
    } as GraphQLInputField,
    listString: {
      name: "field2",
      type: new GraphQLList(GraphQLString),
      description: "",
      defaultValue: null,
      extensions: {},
      isDeprecated: false,
      deprecationReason: null,
      astNode: undefined,
    } as GraphQLInputField,
    enum: {
      name: "field3",
      type: new GraphQLEnumType({
        name: "TestEnum",
        values: {
          VALUE1: { value: "VALUE1" },
          VALUE2: { value: "VALUE2" },
        },
      }),
      description: "",
      defaultValue: null,
      extensions: {},
      isDeprecated: false,
      deprecationReason: null,
      astNode: undefined,
    } as GraphQLInputField,
    nonNullString: {
      name: "field4",
      type: new GraphQLNonNull(GraphQLString),
      description: "",
      defaultValue: null,
      extensions: {},
      isDeprecated: false,
      deprecationReason: null,
      astNode: undefined,
    } as GraphQLInputField,
    listEnum: {
      name: "field5",
      type: new GraphQLList(
        new GraphQLEnumType({
          name: "TestEnum2",
          values: {
            VALUEA: { value: "VALUEA" },
            VALUEB: { value: "VALUEB" },
          },
        }),
      ),
      description: "",
      defaultValue: null,
      extensions: {},
      isDeprecated: false,
      deprecationReason: null,
      astNode: undefined,
    } as GraphQLInputField,
  };

  test("should generate a mutation with a single scalar field", () => {
    const fields = [mockFields.string];
    const singularName = "Test";
    const result = makeAdHocMutation(fields, singularName);
    const printedResult = print(result).replace(/\s/g, "");

    const expected = 'mutation{test_insert(data:{field1:""})}';
    assert.strictEqual(printedResult, expected);
  });

  test("should handle list types", () => {
    const fields = [mockFields.listString];
    const singularName = "Test";
    const result = makeAdHocMutation(fields, singularName);
    const printedResult = print(result).replace(/\s/g, "");

    const expected = 'mutation{test_insert(data:{field2:[""]})}';
    assert.strictEqual(printedResult, expected);
  });

  test("should handle enum types, selecting the first enum value", () => {
    const fields = [mockFields.enum];
    const singularName = "Test";
    const result = makeAdHocMutation(fields, singularName);
    const printedResult = print(result).replace(/\s/g, "");

    const expected = "mutation{test_insert(data:{field3:VALUE1})}";
    assert.strictEqual(printedResult, expected);
  });

  test("should handle list of enum types", () => {
    const fields = [mockFields.listEnum];
    const singularName = "Test";
    const result = makeAdHocMutation(fields, singularName);
    const printedResult = print(result).replace(/\s/g, "");

    const expected = "mutation{test_insert(data:{field5:[VALUEA]})}";
    assert.strictEqual(printedResult, expected);
  });

  test("should handle non-null types", () => {
    const fields = [mockFields.nonNullString];
    const singularName = "Test";
    const result = makeAdHocMutation(fields, singularName);
    const printedResult = print(result).replace(/\s/g, "");

    const expected = 'mutation{test_insert(data:{field4:""})}';
    assert.strictEqual(printedResult, expected);
  });

  test("should generate a mutation with a mix of field types", () => {
    const fields = [mockFields.string, mockFields.listString, mockFields.enum];
    const singularName = "Test";
    const result = makeAdHocMutation(fields, singularName);
    const printedResult = print(result).replace(/\s/g, "");

    const expected =
      'mutation{test_insert(data:{field1:"",field2:[""],field3:VALUE1})}';
    assert.strictEqual(printedResult, expected);
  });

  test("should generate a mutation with a different singular name", () => {
    const fields = [mockFields.string];
    const singularName = "Item";
    const result = makeAdHocMutation(fields, singularName);
    const printedResult = print(result).replace(/\s/g, "");

    const expected = 'mutation{item_insert(data:{field1:""})}';
    assert.strictEqual(printedResult, expected);
  });
});
