import { gemini, gemini as geminiToolModule } from "../../../../src/init/features/aitools/gemini";
import * as vscode from "vscode";
import { firebaseConfig } from "../config";
import { ExtensionBrokerImpl } from "../../extension-broker";
import { AnalyticsLogger, DATA_CONNECT_EVENT_NAME } from "../../analytics";



export function registerFirebaseMCP(broker: ExtensionBrokerImpl, analyticsLogger: AnalyticsLogger): vscode.Disposable {
  const geminiActivateSub = broker.on("firebase.activate.gemini", async () => {
    analyticsLogger.logger.logUsage(
      DATA_CONNECT_EVENT_NAME.TRY_FIREBASE_AGENT_CLICKED,
    );
    writeToGeminiConfig();
    await vscode.commands.executeCommand("cloudcode.gemini.chatView.focus");
    await vscode.commands.executeCommand("geminicodeassist.agent.chat.new"); // opens a new chat when an old one exists;
  });

  const mcpDocsSub = broker.on("docs.mcp.clicked", () => {
    analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MCP_DOCS_CLICKED);
  });
  const tosSub = broker.on("docs.tos.clicked", () => {
    analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.GIF_TOS_CLICKED);
  });

  return vscode.Disposable.from(
    { dispose: geminiActivateSub },
    { dispose: mcpDocsSub },
    { dispose: tosSub },
  );
}

// Writes the Firebase MCP server to the gemini code assist config file
export function writeToGeminiConfig() {

  const config = firebaseConfig.value?.tryReadValue;
  if (!config) {
    vscode.window.showErrorMessage("Could not read firebase.json");
    // TODO: Consider writing to HOME_DIR in case of this failure
    return;
  }

  geminiToolModule.configure(config,  config.projectDir, [/** TODO: Create "dataconnect" .md file */]);
}
