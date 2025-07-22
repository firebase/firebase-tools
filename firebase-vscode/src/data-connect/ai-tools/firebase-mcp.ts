import { gemini as geminiToolModule } from "../../../../src/init/features/aitools/gemini";
import * as vscode from "vscode";
import { firebaseConfig } from "../config";


// Writes the Firebase MCP server to the gemini code assist config file
export function writeToGeminiConfig() {

  const config = firebaseConfig.value?.tryReadValue;
  if (!config) {
    vscode.window.showErrorMessage("Could not read firebase.json");
    // Consider writing to HOME_DIR in case of this failure
    return;
  }

  geminiToolModule.configure(config, "" , [/** TODO: Create "dataconnect" .md file */]);
}
