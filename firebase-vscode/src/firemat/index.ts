import vscode, { Disposable, ExtensionContext } from "vscode";
import { effect } from "@preact/signals-core";

import { ExtensionBrokerImpl } from "../extension-broker";
import { registerExecution } from "./execution";
import { registerExplorer } from "./explorer";
import { registerAdHoc } from "./ad-hoc-mutations";
import { FirematService } from "./service";
import {
  OperationCodeLensProvider,
  SchemaCodeLensProvider,
} from "./code-lens-provider";
import { globalSignal } from "../utils/globals";
import { registerConnectors } from "./connectors";
import { AuthService } from "../auth/service";
import { registerFirebaseDataConnectView } from "./connect-instance";
import { currentProjectId } from "../core/project";
import { isTest } from "../utils/env";
// import { setupLanguageClient } from "./language-client";

const firematEndpoint = globalSignal<string | undefined>(undefined);

export function registerFiremat(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  authService: AuthService,
): Disposable {
  console.log("here", "registerFiremat");
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
      vscode.commands.executeCommand("firebase.firemat.executeIntrospection");
    }
  });

  const selectedProjectStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  selectedProjectStatus.tooltip = "Select a Firebase project";
  selectedProjectStatus.command = "firebase.selectProject";

  return Disposable.from(
    selectedProjectStatus,
    {
      dispose: effect(() => {
        selectedProjectStatus.text = currentProjectId.value ?? "<No project>";
        selectedProjectStatus.show();
      }),
    },
    registerExecution(context, broker, firematService),
    registerExplorer(context, broker, firematService),
    registerFirebaseDataConnectView(context, broker),
    registerAdHoc(context, broker),
    registerConnectors(context, broker, firematService),
    operationCodeLensProvider,
    vscode.languages.registerCodeLensProvider(
      // **Hack**: For testing purposes, enable code lenses on all graphql files
      // inside the test_projects folder.
      // This is because e2e tests start without graphQL installed,
      // so code lenses would otherwise never show up.
      isTest
        ? [{ pattern: "/**/firebase-vscode/src/test/test_projects/**/*.gql" }]
        : [
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
