import { AnalyticsLogger } from "../analytics";
import { ExtensionBrokerImpl } from "../extension-broker";
import * as vscode from "vscode";
import { DataConnectService } from "./service";
import {
  ChatRequest,
  ChatResponseStream,
  GeminiCodeAssist,
  SuggestedPromptProvider,
} from "./gemini-tool-types";
import { GeminiAssistController } from "./gemini-assist";

export const DATACONNECT_TOOL_ID = "dataconnect";
export const DATACONNECT_DISPLAY_NAME = "Dataconnect";
export const SUGGESTED_PROMPTS = [
  "Create a schema for a pizza store",
  "Create a user type in this schema",
];

export class GeminiToolController implements SuggestedPromptProvider {
  constructor(private geminiAssistController: GeminiAssistController) {
    const gemini = vscode.extensions.getExtension<GeminiCodeAssist>(
      "google.geminicodeassist",
    );
    if (!gemini || !gemini.isActive) {
      throw new Error("Gemini extension not found");
    }

    gemini?.activate().then((gca) => {
      const tool = gca.registerTool(
        DATACONNECT_TOOL_ID,
        DATACONNECT_DISPLAY_NAME,
        "GoogleCloudTools.firebase-dataconnect-vscode",
      );
      tool.registerChatHandler(this.handleChat.bind(this));
      tool.registerSuggestedPromptProvider(this);

      console.log("HAROLD TOOL: ", tool);
    });
  }

  async handleChat(
    request: ChatRequest,
    responseStream: ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {

    const prompt = request.prompt.fullPrompt();
    //TODO: deal with non-open editor situation
    const currentDocumentPath =
      vscode.window.activeTextEditor?.document.uri.path;

    const resp = await this.geminiAssistController.callGenerateApi(
      currentDocumentPath || "",
      prompt,
    );

    const markdown = new vscode.MarkdownString(resp.output.messages[0].content);
    responseStream.push(markdown);

    responseStream.close();
  }

  provideSuggestedPrompts(): string[] {
    return SUGGESTED_PROMPTS;
  }
}
