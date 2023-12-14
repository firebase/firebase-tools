import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { ObjectTypeDefinitionNode } from "graphql";
import { Uri } from "vscode";
export function registerAdHoc(
    context: ExtensionContext,
    broker: ExtensionBrokerImpl,
): Disposable {


    const fileMap = {};
    const pathSuffix = "_insert.gql";

    /** 
     * Creates a playground file with an ad-hoc mutation
     * File will be created (unsaved) in operations/ folder, with an auto-generated named based on the schema type
     * Mutation will be generated with all 
     * */
    async function schemaAddData(ast: ObjectTypeDefinitionNode, { documentPath, position }) {
        // generate content for the file
        const preamble = '# This is a file for you to write an un-named mutation. \n # Only one un-named mutation is allowed per file.';
        const dupeMutationInfo = "# Please save this in the operations/ folder with your other un-named mutations."
        const adhocMutation = generateMutation(ast);

        const basePath = vscode.workspace.rootPath + "/api/";
        const filePath = vscode.Uri.file(basePath + ast.name + pathSuffix);
        const doesFileExist = await checkIfFileExists(filePath);

        if (!doesFileExist) {
            // opens unsaved text document with name "[mutationName]_insert.gql"
            const content = [preamble, adhocMutation].join("\n");

            vscode.workspace.openTextDocument(filePath.with({ scheme: 'untitled' })).then(doc => {
                vscode.window.showTextDocument(doc).then((openDoc) => {
                    openDoc.edit(edit => {
                        edit.insert(new vscode.Position(0, 0), content);
                    });
                });
            });
        } else {
            // Opens untitled text document
            vscode.workspace.openTextDocument({
                content: [preamble, dupeMutationInfo, adhocMutation].join("\n"),
                language: "graphql"
            }).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        }
    }

    async function checkIfFileExists(file: Uri) {
        try {
            await vscode.workspace.fs.stat(file);
            return false;
        } catch {
            return true;
        }
    }

    function generateMutation(ast: ObjectTypeDefinitionNode): string {
        const name = ast.name.value.toLowerCase();
        const functionSpacing = "\t";
        const fieldSpacing = "\t\t";
        const mutation = [];

        mutation.push("mutation {", functionSpacing + name + "_insert(data: {");
        for (const field of ast.fields) {
            mutation.push(fieldSpacing + field.name.value + ": " + '""')
        }
        mutation.push(functionSpacing + "})", "}")
        return mutation.join("\n");
    }

    return Disposable.from(
        vscode.commands.registerCommand(
            "firebase.firemat.schemaAddData",
            schemaAddData
        ),
    );
}
