import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { ObjectTypeDefinitionNode } from "graphql";
import { checkIfFileExists } from "./file-utils";

export function registerAdHoc(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl
): Disposable {
  const pathSuffix = "_insert.gql";
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
  async function schemaAddData(
    ast: ObjectTypeDefinitionNode,
    { documentPath, position }
  ) {
    // generate content for the file
    const preamble =
      "# This is a file for you to write an un-named mutation. \n# Only one un-named mutation is allowed per file.";
    const adhocMutation = generateMutation(ast);
    const content = [preamble, adhocMutation].join("\n");

    const basePath = vscode.workspace.rootPath + "/dataconnect/";
    const filePath = vscode.Uri.file(basePath + ast.name.value + pathSuffix);
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
        `${fieldSpacing}${fieldName}: ${defaultValue} # ${fieldTypeName}`
      ); // field name + temp value + comment
    }
    mutation.push(`${functionSpacing}})`, "}"); // closing braces/paren
    return mutation.join("\n");
  }

  return Disposable.from(
    vscode.commands.registerCommand(
      "firebase.dataConnect.schemaAddData",
      schemaAddData
    )
  );
}
