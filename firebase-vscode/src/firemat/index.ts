import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerExecution } from "./execution";
import { registerExplorer } from "./explorer";
import { FirematService } from "./service";
import { CodeLensProvider } from "./code-lens-provider";
import { setupLanguageClient } from "./language-client";
import { signal } from "@preact/signals-core";

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
    firematEndpoint.value = endpoint;
    // also update LSP
    vscode.commands.executeCommand("sendFirematEndpointToLSP", endpoint);
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
