import vscode, { Disposable, ExtensionContext } from "vscode";
import { signal } from "@preact/signals-core";

import { ExtensionBrokerImpl } from "../extension-broker";
import { registerExecution } from "./execution";
import { registerExplorer } from "./explorer";
import { FirematService } from "./service";
import { CodeLensProvider } from "./code-lens-provider";
import { setupLanguageClient } from "./language-client";

const firematEndpoint = signal<string>("");

export function registerFiremat(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl
): Disposable {
  const firematService = new FirematService(firematEndpoint);
  const codeLensProvider = new CodeLensProvider();

  const client = setupLanguageClient(context, firematEndpoint);
  client.start();

  // keep global endpoint signal updated
  broker.on("notifyFirematEmulatorEndpoint", ({ endpoint }) => {
    // basic cacheing to avoid duplicate calls during emulator startup
    if (firematEndpoint.value !== endpoint) {
      firematEndpoint.value = endpoint;
      // also update LSP
      vscode.commands.executeCommand("firemat-graphql.restart");
      vscode.commands.executeCommand('firebase.firemat.executeIntrospection');
    }
  });

  return Disposable.from(
    registerExecution(context, broker, firematService),
    registerExplorer(context, broker, firematService),
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", language: "graphql" },
      codeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", language: "gql" },
      codeLensProvider
    ),
    {
      dispose: () => {
        client.stop();
      },
    }
  );
}
