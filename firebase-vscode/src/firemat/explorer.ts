import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerWebview } from "../webview";
import { ExplorerTreeDataProvider } from "./explorer-provider";
import { signal, effect } from "@preact/signals-core";
import { IntrospectionQuery, OperationDefinitionNode, print } from "graphql";
import { FirematService } from "./service";


// explorer store
export const introspectionQuery = signal<IntrospectionQuery>(null);


export function registerExplorer(
    context: ExtensionContext,
    broker: ExtensionBrokerImpl,
    firematService: FirematService
): Disposable {
    const treeDataProvider = new ExplorerTreeDataProvider();
    const explorerTreeView = vscode.window.createTreeView("firebase.firemat.explorerView", {
        treeDataProvider,
    });

    async function executeIntrospection() {
        const results = await firematService.introspect();
        introspectionQuery.value = results.data as IntrospectionQuery;
    }

    return Disposable.from(
        explorerTreeView,
        vscode.commands.registerCommand(
            "firebase.firemat.executeIntrospection",
            executeIntrospection
        ),
    );
}
