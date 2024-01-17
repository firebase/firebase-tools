import vscode, { Disposable, ExtensionContext } from "vscode";
import { signal } from "@preact/signals-core";

import { ExtensionBrokerImpl } from "../extension-broker";
import { registerExecution } from "./execution";
import { registerExplorer } from "./explorer";
import { registerAdHoc } from "./ad-hoc-mutations";
import { FirematService } from "./service";
import {
  OperationCodeLensProvider,
  SchemaCodeLensProvider,
} from "./code-lens-provider";
import { registerConnectors } from "./connectors";
import { AuthService } from "../auth/service";
// import { setupLanguageClient } from "./language-client";

const firematEndpoint = signal<string | undefined>(undefined);

export function registerFiremat(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  authService: AuthService,
): Disposable {
  const firematService = new FirematService(firematEndpoint, authService);
  const operationCodeLensProvider = new OperationCodeLensProvider();
  const schemaCodeLensProvider = new SchemaCodeLensProvider();

  // const client = setupLanguageClient(context, firematEndpoint);
  // client.start();

  // keep global endpoint signal updated
  broker.on("notifyFirematEmulatorEndpoint", ({ endpoint }) => {
    // basic caching to avoid duplicate calls during emulator startup
    if (firematEndpoint.value !== endpoint) {
      firematEndpoint.value = endpoint;
      // also update LSP
      vscode.commands.executeCommand("firemat-graphql.restart");
      vscode.commands.executeCommand("firebase.firemat.executeIntrospection");
    }
  });

  return Disposable.from(
    registerExecution(context, broker, firematService),
    registerExplorer(context, broker, firematService),
    registerAdHoc(context, broker),
    registerConnectors(context, broker, firematService),
    operationCodeLensProvider,
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: "file", language: "graphql" },
        { scheme: "untitled", language: "graphql" },
      ],
      operationCodeLensProvider,
    ),
    schemaCodeLensProvider,
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: "file", language: "graphql" },
        // Don't show in untitled files since the provider needs the file name.
      ],
      schemaCodeLensProvider,
    ),
    {
      dispose: () => {
        // client.stop();
      },
    },
  );
}
