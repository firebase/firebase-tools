import vscode, { Disposable } from "vscode";
import {
  DocumentNode,
  GraphQLInputField,
  Kind,
  ObjectFieldNode,
  ObjectTypeDefinitionNode,
  OperationDefinitionNode,
  OperationTypeNode,
  ValueNode,
  buildClientSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isListType,
  print,
} from "graphql";
import { upsertFile } from "./file-utils";
import { DataConnectService } from "./service";
import { DATA_CONNECT_EVENT_NAME } from "../analytics";
import { dataConnectConfigs } from "./config";
import { firstWhereDefined } from "../utils/signal";
import { AnalyticsLogger } from "../analytics";

export function registerAdHoc(
  dataConnectService: DataConnectService,
  analyticsLogger: AnalyticsLogger,
): Disposable {
  /**
   * Creates a playground file with an ad-hoc mutation
   * File will be created (unsaved) in operations/ folder, with an auto-generated named based on the schema type
   * Mutation will be generated with all
   * */
  async function schemaReadData(
    document: DocumentNode,
    ast: ObjectTypeDefinitionNode,
    documentPath: string,
  ) {
    // TODO(hlshen): Revamp makeQuery to utilize live schema, and built out an AST instead of construction the query through string builder
    const primitiveTypes = new Set([
      "String",
      "Int",
      "Int64",
      "Boolean",
      "Date",
      "Timestamp",
      "Float",
      "Any",
    ]);

    const configs = await firstWhereDefined(dataConnectConfigs);
    const dataconnectConfig =
      configs.tryReadValue?.findEnclosingServiceForPath(documentPath);

    const basePath = dataconnectConfig?.path;
    const filePath = vscode.Uri.file(`${basePath}/${ast.name.value}_read.gql`);

    // Recursively build a query for the object type.
    // Returns undefined if the query is empty.
    function buildRecursiveObjectQuery(
      ast: ObjectTypeDefinitionNode,
      level: number = 1,
    ): string | undefined {
      const indent = "  ".repeat(level);

      // Whether the query is non-empty. Used to determine whether to return undefined.
      var hasField = false;
      let query = "{\n";
      for (const field of ast.fields!) {
        // We unwrap NonNullType and ListType to obtain the actual type
        let fieldType = field.type;
        while (
          fieldType.kind === Kind.LIST_TYPE ||
          fieldType.kind === Kind.NON_NULL_TYPE
        ) {
          fieldType = fieldType.type;
        }

        // Deference, for the sake of enabling TS to upcast to NamedType later
        const targetType = fieldType;
        if (targetType.kind === Kind.NAMED_TYPE) {
          // Check if the type is a primitive type, such that no recursion is needed.
          if (primitiveTypes.has(targetType.name.value)) {
            query += `  ${indent}${field.name.value}\n`;
            hasField = true;
            continue;
          }

          const isEnum = document.definitions.some(
            (def) =>
              def.kind === Kind.ENUM_TYPE_DEFINITION &&
              def.name.value === targetType.name.value,
          );
          if (isEnum) {
            query += `  ${indent}${field.name.value}\n`;
            hasField = true;
            continue;
          }

          // Check relational types.
          // Since we lack a schema, we can only build queries for types that are defined in the same document.
          const targetTypeDefinition = document.definitions.find(
            (def) =>
              def.kind === Kind.OBJECT_TYPE_DEFINITION &&
              def.name.value === targetType.name.value,
          ) as ObjectTypeDefinitionNode;

          if (targetTypeDefinition) {
            const subQuery = buildRecursiveObjectQuery(
              targetTypeDefinition,
              level + 1,
            );
            if (!subQuery) {
              continue;
            }
            query += `  ${indent}${field.name.value} ${subQuery}\n`;
            hasField = true;
          }
        }
      }

      query += `${indent}}`;
      if (!hasField) {
        return undefined;
      }
      return query;
    }

    await upsertFile(filePath, () => {
      const queryName = `${ast.name.value.charAt(0).toLowerCase()}${ast.name.value.slice(1)}s`;

      return `\n# This is a file for you to write an un-named query.\n# Only one un-named query is allowed per file.\nquery {\n  ${queryName}${buildRecursiveObjectQuery(ast)!}\n}`;
    });
  }

  /**
   * Creates a playground file with an ad-hoc mutation
   * File will be created (unsaved) in operations/ folder, with an auto-generated named based on the schema type
   * Mutation will be generated with all
   * */
  async function schemaAddData(
    ast: ObjectTypeDefinitionNode,
    documentPath: string,
  ) {
    // generate content for the file
    const introspect = await dataConnectService.introspect();
    if (!introspect.data) {
      vscode.window.showErrorMessage(
        "Failed to generate mutation. Please check your compilation errors.",
      );
      return;
    }
    const schema = buildClientSchema(introspect.data);
    const dataType = schema.getType(`${ast.name.value}_Data`);
    if (!isInputObjectType(dataType)) {
      return;
    }

    // get root where dataconnect.yaml lives
    const configs = await firstWhereDefined(dataConnectConfigs);
    const dataconnectConfig =
      configs.tryReadValue?.findEnclosingServiceForPath(documentPath);
    const basePath = dataconnectConfig?.path;

    const filePath = vscode.Uri.file(
      `${basePath}/${ast.name.value}_insert.gql`,
    );

    await upsertFile(filePath, () => {
      const preamble =
        "# This is a file for you to write an un-named mutation. \n# Only one un-named mutation is allowed per file.";
      const adhocMutation = print(
        makeAdHocMutation(Object.values(dataType.getFields()), ast.name.value),
      );
      return [preamble, adhocMutation].join("\n");
    });
  }

  return Disposable.from(
    vscode.commands.registerCommand(
      "firebase.dataConnect.schemaAddData",
      (ast, uri) => {
        analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.ADD_DATA);
        schemaAddData(ast, uri);
      },
    ),
    vscode.commands.registerCommand(
      "firebase.dataConnect.schemaReadData",
      (document, ast, uri) => {
        analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.READ_DATA);
        schemaReadData(document, ast, uri);
      },
    ),
  );
}

export function makeAdHocMutation(
  fields: GraphQLInputField[],
  singularName: string,
): OperationDefinitionNode {
  const argumentFields: ObjectFieldNode[] = [];

  for (const field of fields) {
    const type = getNamedType(field.type);
    let defaultValue: ValueNode | undefined;
    if (isEnumType(type)) {
      const enumValues = type.getValues();
      if (enumValues.length > 0) {
        defaultValue = { kind: Kind.ENUM, value: enumValues[0].name };
      }
    } else {
      defaultValue = getDefaultScalarValueNode(type.name);
    }
    if (!defaultValue) {
      continue;
    }

    // convert it back to a list
    if (isListType(field.type)) {
      defaultValue = { kind: Kind.LIST, values: [defaultValue] };
    }

    argumentFields.push({
      kind: Kind.OBJECT_FIELD,
      name: { kind: Kind.NAME, value: field.name },
      value: defaultValue,
    });
  }

  return {
    kind: Kind.OPERATION_DEFINITION,
    operation: OperationTypeNode.MUTATION,
    selectionSet: {
      kind: Kind.SELECTION_SET,
      selections: [
        {
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: `${singularName.charAt(0).toLowerCase()}${singularName.slice(1)}_insert`,
          },
          arguments: [
            {
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "data" },
              value: {
                kind: Kind.OBJECT,
                fields: argumentFields,
              },
            },
          ],
        },
      ],
    },
  };
}
function getDefaultScalarValueNode(type: string): ValueNode | undefined {
  switch (type) {
    case "Any":
      return { kind: Kind.OBJECT, fields: [] };
    case "Boolean":
      return { kind: Kind.BOOLEAN, value: false };
    case "Date":
      return {
        kind: Kind.STRING,
        value: new Date().toISOString().substring(0, 10),
      };
    case "Float":
      return { kind: Kind.FLOAT, value: "0" };
    case "Int":
      return { kind: Kind.INT, value: "0" };
    case "Int64":
      return { kind: Kind.INT, value: "0" };
    case "String":
      return { kind: Kind.STRING, value: "" };
    case "Timestamp":
      return { kind: Kind.STRING, value: new Date().toISOString() };
    case "UUID":
      return { kind: Kind.STRING, value: "11111111222233334444555555555555" };
    case "Vector":
      return { kind: Kind.LIST, values: [] };
    default:
      return undefined;
  }
}

export function getDefaultScalarValue(type: string): any {
  switch (type) {
    case "Boolean":
      return false;
    case "Date":
      return new Date().toISOString().substring(0, 10);
    case "Float":
      return 0.0;
    case "Int":
      return 0;
    case "Int64":
      return "0";
    case "String":
      return "";
    case "Timestamp":
      return new Date().toISOString();
    case "UUID":
      return "11111111222233334444555555555555";
    case "Vector":
      return [1.1, 2.2, 3.3];
    default:
      return undefined;
  }
}
