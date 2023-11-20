import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerWebview } from "../webview";
import { ObjectTypeDefinitionNode } from "graphql";
import { introspectionQuery } from "./explorer";
import { effect } from "@preact/signals-core";
import path from "path";
export function registerAdHoc(
    context: ExtensionContext,
    broker: ExtensionBrokerImpl,
): Disposable {

    async function schemaAddData(ast: ObjectTypeDefinitionNode, { documentPath, position }) {
        console.log(ast);

        console.log(introspectionQuery.value);
        const content = 'This is a playground file for you to write a mutation \n' + ast.name.value;

        const filePath = path.join(vscode.workspace.rootPath + "/api/", 'playground.gql');

        const openPath = vscode.Uri.file(filePath);
        console.log("opening path");
        vscode.workspace.openTextDocument(openPath.with({ scheme: 'untitled' })).then(doc => {
            vscode.window.showTextDocument(doc).then((openDoc) => {
                openDoc.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), content);
                });
            });
        });
    }

    // broker.on("definedFirematArgs", setExecutionArgs);

    return Disposable.from(
        vscode.commands.registerCommand(
            "firebase.firemat.schemaAddData",
            schemaAddData
        ),
    );
}
