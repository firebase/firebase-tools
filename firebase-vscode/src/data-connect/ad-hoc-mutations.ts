import vscode, { Disposable } from "vscode";
import { DocumentNode, Kind, ObjectTypeDefinitionNode } from "graphql";
import { checkIfFileExists, upsertFile } from "./file-utils";

export function registerAdHoc(): Disposable {
  const defaultScalarValues = {
    Any: "{}",
    AuthUID: '""',
    Boolean: "false",
    Date: `"${new Date().toISOString().substring(0, 10)}"`,
    Float: "0",
    ID: '""',
    Int: "0",
    Int64: "0",
    String: '""',
    Timestamp: `"${new Date().toISOString()}"`,
    Vector: "[]",
  };

  function isDataConnectScalarType(fieldType: string): boolean {
    return fieldType in defaultScalarValues;
  }

  /**
   * Creates a playground file with an ad-hoc mutation
   * File will be created (unsaved) in operations/ folder, with an auto-generated named based on the schema type
   * Mutation will be generated with all
   * */
  async function schemaReadData(
    document: DocumentNode,
    ast: ObjectTypeDefinitionNode,
  ) {
    // TODO(rrousselGit) - this is a temporary solution due to the lack of a "schema".
    // As such, we hardcoded the list of allowed primitives.
    // We should ideally refactor this to allow any scalar type.
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

    const basePath = vscode.workspace.rootPath + "/dataconnect/";
    const filePath = vscode.Uri.file(`${basePath}${ast.name.value}_read.gql`);

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
      for (const field of ast.fields) {
        // We unwrap NonNullType to obtain the actual type
        let fieldType = field.type;
        if (fieldType.kind === Kind.NON_NULL_TYPE) {
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
      return query;
    }

    await upsertFile(filePath, () => {
      const queryName = `${ast.name.value.charAt(0).toLowerCase()}${ast.name.value.slice(1)}s`;

      return `
# This is a file for you to write an un-named queries. 
# Only one un-named query is allowed per file.
query {
  ${queryName}${buildRecursiveObjectQuery(ast)!}
}`;
    });
  }

  /**
   * Creates a playground file with an ad-hoc mutation
   * File will be created (unsaved) in operations/ folder, with an auto-generated named based on the schema type
   * Mutation will be generated with all
   * */
  async function schemaAddData(ast: ObjectTypeDefinitionNode) {
    // generate content for the file
    const preamble =
      "# This is a file for you to write an un-named mutation. \n# Only one un-named mutation is allowed per file.";
    const adhocMutation = generateMutation(ast);
    const content = [preamble, adhocMutation].join("\n");

    const basePath = vscode.workspace.rootPath + "/dataconnect/";
    const filePath = vscode.Uri.file(`${basePath}${ast.name.value}_insert.gql`);
    const doesFileExist = await checkIfFileExists(filePath);

    if (!doesFileExist) {
      // opens unsaved text document with name "[mutationName]_insert.gql"

      vscode.workspace
        .openTextDocument(filePath.with({ scheme: "untitled" }))
        .then((doc) => {
          vscode.window.showTextDocument(doc).then((openDoc) => {
            openDoc.edit((edit) => {
              edit.insert(new vscode.Position(0, 0), content);
            });
          });
        });
    } else {
      // Opens existing text document
      vscode.workspace.openTextDocument(filePath).then((doc) => {
        vscode.window.showTextDocument(doc);
      });
    }
  }

  function generateMutation(ast: ObjectTypeDefinitionNode): string {
    const name =
      ast.name.value.charAt(0).toLowerCase() + ast.name.value.slice(1);
    const functionSpacing = "\t";
    const fieldSpacing = "\t\t";
    const mutation = [];

    mutation.push("mutation {"); // mutation header
    mutation.push(`${functionSpacing}${name}_insert(data: {`); // insert function
    for (const field of ast.fields) {
      // necessary to avoid type error
      const fieldType: any = field.type;
      let fieldTypeName: string = fieldType.type.name.value;
      let fieldName: string = field.name.value;
      let defaultValue = defaultScalarValues[fieldTypeName] as string;

      if (!isDataConnectScalarType(fieldTypeName)) {
        fieldTypeName += "Id";
        fieldName += "Id";
        defaultValue = '""';
      }
      mutation.push(
        `${fieldSpacing}${fieldName}: ${defaultValue} # ${fieldTypeName}`,
      ); // field name + temp value + comment
    }
    mutation.push(`${functionSpacing}})`, "}"); // closing braces/paren
    return mutation.join("\n");
  }

  return Disposable.from(
    vscode.commands.registerCommand(
      "firebase.dataConnect.schemaAddData",
      schemaAddData,
    ),
    vscode.commands.registerCommand(
      "firebase.dataConnect.schemaReadData",
      schemaReadData,
    ),
  );
}
