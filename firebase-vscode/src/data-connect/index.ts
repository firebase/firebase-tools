import vscode, { Disposable, ExtensionContext } from "vscode";
import { effect } from "@preact/signals-core";

import { ExtensionBrokerImpl } from "../extension-broker";
import { registerExecution } from "./execution";
import { registerExplorer } from "./explorer";
import { registerAdHoc } from "./ad-hoc-mutations";
import { FirematService as FdcService } from "./service";
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
import { setupLanguageClient } from "./language-client";
import { EmulatorsController } from "../core/emulators";

export function registerFdc(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  authService: AuthService,
  emulatorController: EmulatorsController,
): Disposable {
  const fdcService = new FdcService(authService, emulatorController);
  const operationCodeLensProvider = new OperationCodeLensProvider(
    emulatorController,
  );
  const schemaCodeLensProvider = new SchemaCodeLensProvider(emulatorController);

  const client = setupLanguageClient(context, fdcService.endpoint);
  client.start();

  // Perform some side-effects when the endpoint changes
  context.subscriptions.push({
    dispose: effect(() => {
      if (fdcService.endpoint.value) {
        // TODO move to client.start or setupLanguageClient
        vscode.commands.executeCommand("fdc-graphql.restart");

        vscode.commands.executeCommand("firebase.firemat.executeIntrospection");
      }
    }),
  });

  const selectedProjectStatus = vscode.window.createStatusBarItem(
    "projectPicker",
    vscode.StatusBarAlignment.Left,
  );
  selectedProjectStatus.tooltip = "Select a Firebase project";
  selectedProjectStatus.command = "firebase.selectProject";

  return Disposable.from(
    selectedProjectStatus,
    {
      dispose: effect(() => {
        selectedProjectStatus.text = `$(mono-firebase) ${currentProjectId.value ?? "<No project>"}`;
        selectedProjectStatus.show();
      }),
    },
    registerExecution(context, broker, fdcService, emulatorController),
    registerExplorer(context, broker, fdcService),
    registerFirebaseDataConnectView(context, broker, emulatorController),
    registerAdHoc(context, broker),
    registerConnectors(context, broker, fdcService),
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
        client.stop();
      },
    },
  );
}
