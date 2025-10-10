import { gemini as geminiToolModule } from "../../../../src/init/features/aitools/gemini";
import * as vscode from "vscode";
import { firebaseConfig } from "../config";
import { ExtensionBrokerImpl } from "../../extension-broker";
import { AnalyticsLogger, DATA_CONNECT_EVENT_NAME } from "../../analytics";
import { configstore } from "../../../../src/configstore";

const GEMINI_EXTENSION_ID = "google.geminicodeassist";

async function ensureGeminiExtension(): Promise<boolean> {
  let geminiExtension = vscode.extensions.getExtension(GEMINI_EXTENSION_ID);

  if (geminiExtension) {
    if (!geminiExtension.isActive) {
      await geminiExtension.activate();
    }
    return true;
  }

  const selection = await vscode.window.showInformationMessage(
    "The Firebase Assistant requires the Gemini Code Assist extension. Do you want to install it?",
    "Yes",
    "No",
  );

  if (selection !== "Yes") {
    vscode.window.showWarningMessage(
      "Cannot open Firebase Assistant without the Gemini Code Assist extension.",
    );
    return false;
  }

  const disposable = vscode.extensions.onDidChange(async () => {
    geminiExtension = vscode.extensions.getExtension(GEMINI_EXTENSION_ID);
    if (geminiExtension) {
      await openGeminiChat();
      disposable.dispose();
    }
  });
  vscode.commands.executeCommand(
    "workbench.extensions.installExtension",
    GEMINI_EXTENSION_ID,
  );

  return false;
}

// Writes MCP config, then opens up Gemini with a new chat
async function openGeminiChat() {
  configstore.set("gemini", true);
  writeToGeminiConfig();
  await vscode.commands.executeCommand("cloudcode.gemini.chatView.focus");
  await vscode.commands.executeCommand("geminicodeassist.agent.chat.new");
}

export function registerFirebaseMCP(
  broker: ExtensionBrokerImpl,
  analyticsLogger: AnalyticsLogger,
): vscode.Disposable {
  const geminiActivateSub = broker.on("firebase.activate.gemini", async () => {
    analyticsLogger.logger.logUsage(
      DATA_CONNECT_EVENT_NAME.TRY_FIREBASE_AGENT_CLICKED,
    );

    const geminiReady = await ensureGeminiExtension();
    if (!geminiReady) {
      return;
    }
    await openGeminiChat();
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

  geminiToolModule.configure(config, config.projectDir, [
    /** TODO: Create "dataconnect" .md file */
  ]);
}
