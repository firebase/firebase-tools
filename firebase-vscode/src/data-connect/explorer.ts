import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { ExplorerTreeDataProvider } from "./explorer-provider";
import { IntrospectionQuery } from "graphql";
import { DataConnectService } from "./service";
import { globalSignal } from "../utils/globals";

// explorer store
export const introspectionQuery = globalSignal<IntrospectionQuery | undefined>(
  undefined,
);

export function registerExplorer(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  dataConnectService: DataConnectService,
): Disposable {
  const treeDataProvider = new ExplorerTreeDataProvider();
  const explorerTreeView = vscode.window.createTreeView(
    "firebase.dataConnect.explorerView",
    {
      treeDataProvider,
    },
  );

  async function executeIntrospection() {
    const results = await dataConnectService.introspect();
    introspectionQuery.value = results.data;
  }

  return Disposable.from(
    explorerTreeView,
    vscode.commands.registerCommand(
      "firebase.dataConnect.executeIntrospection",
      executeIntrospection,
    ),
  );
}
