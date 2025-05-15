import { AnalyticsLogger } from "../../analytics";
import { ExtensionBrokerImpl } from "../../extension-broker";
import * as vscode from "vscode";
import { DataConnectService } from "../service";
import {
  ChatPrompt,
  ChatRequest,
  ChatResponseStream,
  CommandDetail,
  CommandProvider,
  GeminiCodeAssist,
} from "./gca-tool-types";
import { insertToBottomOfActiveFile } from "../file-utils";
import { ExtensionContext } from "vscode";
import { Chat, Command } from "./types";
import { GeminiToolController } from "./tool-controller";
import { ChatMessage } from "../../dataconnect/cloudAICompanionTypes";
export const DATACONNECT_TOOL_ID = "data-connect";
export const DATACONNECT_DISPLAY_NAME = "Data Connect";
export const SUGGESTED_PROMPTS = [
  "/generate_schema Create a schema for a pizza store",
  "/generate_operation Create a mutations for all my types",
];
const HELP_MESSAGE = `
Welcome to the Data Connect Tool.
Usage:
  @data-connect /generate_schema <your prompt>\n
  @data-connect /generate_operation <your prompt>
`;

export class GCAToolClient {
  private history: Chat[] = [];
  private icon = vscode.Uri.joinPath(
    this.context.extensionUri,
    "resources",
    "firebase_dataconnect_logo.svg",
  );
  constructor(
    private context: ExtensionContext,
    private toolController: GeminiToolController,
  ) {}

  async activate() {
    const gemini = vscode.extensions.getExtension<GeminiCodeAssist>(
      "google.geminicodeassist",
    );
    if (!gemini || !gemini.isActive) {
      throw new Error("Gemini extension not found"); // should never happen, gemini is an extension depedency
    }

    gemini?.activate().then(async (gca) => {
      const tool = gca.registerTool(
        DATACONNECT_TOOL_ID,
        DATACONNECT_DISPLAY_NAME,
        "GoogleCloudTools.firebase-dataconnect-vscode",
        this.icon,
        "help",
      );
      tool.registerChatHandler(this.handleChat.bind(this));
      tool.registerSuggestedPromptProvider(this);
      tool.registerCommandProvider(
        new DataConnectCommandProvider(this.icon.toString()),
      );
    });
  }

  /** implementation of handleChat interface;
   * We redirect the request to our controller
   */
  async handleChat(
    request: ChatRequest,
    responseStream: ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    // Helper just to convert to markdown first
    function pushToResponseStream(text: string) {
      const markdown = new vscode.MarkdownString(text);
      responseStream.push(markdown);
    }

    // Adds the Graphql code block button "Insert to bottom of file"
    addCodeHandlers(responseStream);

    let response: ChatMessage[];

    // parse the prompt
    if (!isPromptValid(request.prompt)) {
      pushToResponseStream(HELP_MESSAGE);
      responseStream.close();
      return;
    }
    const content = getPrompt(request.prompt);
    const command = getCommand(request.prompt);

    // Forward to tool controller
    try {
      this.history.push({ author: "USER", content, commandContext: command });
      response = await this.toolController.handleChat(
        content,
        this.history,
        command,
      );
    } catch (error) {
      let errorMessage = "";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      pushToResponseStream(errorMessage);

      // reset history on error
      this.history = [];
      responseStream.close();
      return;
    }
    const agentMessage = response.pop()?.content;

    if (agentMessage) {
      this.history.push({ author: "AGENT", content: agentMessage });
    }

    pushToResponseStream(
      agentMessage || "Gemini encountered an error. Please try again.}",
    );
    responseStream.close();
  }

  provideSuggestedPrompts(): string[] {
    return SUGGESTED_PROMPTS;
  }
}

class DataConnectCommandProvider implements CommandProvider {
  schemaCommand: CommandDetail = {
    command: Command.GENERATE_SCHEMA,
    description: "Generates a GraphQL schema based on a prompt",
    icon: this.icon,
  };

  operationCommand: CommandDetail = {
    command: Command.GENERATE_OPERATION,
    description: "Generates a GraphQL query or mutation based on a prompt",
    icon: this.icon,
  };

  helpCommand: CommandDetail = {
    command: "help",
    description: "Shows this help message",
    icon: this.icon,
  };
  constructor(readonly icon: string) {}
  listCommands(): Promise<CommandDetail[]> {
    const commands: CommandDetail[] = [
      this.schemaCommand,
      this.operationCommand,
      // this.helpCommand,
    ];
    return Promise.resolve(commands);
  }
}

/** Exploring a variable provider for dataconnect introspected types */
// class DataConnectTypeVariableProvider implements VariableProvider {
//   constructor(private fdcService: DataConnectService) {}
//   async listVariables(): Promise<Variable[]> {
//     const introspection = await this.fdcService.introspect();
//     console.log(introspection);
//     return introspection.data!.__schema.types.map((type) => {
//       return {
//         name: type.name,
//         description: type.description as string,
//       };
//     });
//   }

//   typeahead(
//     part: string,
//     limit: number,
//     token: vscode.CancellationToken,
//   ): Promise<Variable[]> {
//     throw new Error("Method not implemented.");
//   }
// }

// currently only supports a single button
function addCodeHandlers(responseStream: ChatResponseStream) {
  responseStream.addCodeHandlerButton(
    "Insert to bottom of file",
    ({ codeBlock }) => {
      insertToBottomOfActiveFile(codeBlock);
    },
    { languages: /graphql|graphqllanguage/ },
  );
}

// Basic validation function to ensure deterministic command
function isPromptValid(prompt: ChatPrompt): boolean {
  if (prompt.length < 2) {
    return false;
  }
  if (prompt.getPromptParts()[0].getPrompt() !== "@data-connect") {
    return false;
  }

  return isCommandValid(
    prompt.getPromptParts()[1].getPrompt().replace("/", ""),
  );
}

function isCommandValid(command: string): boolean {
  return (Object.values(Command) as string[]).includes(command);
}

// get the /command without the /
function getCommand(prompt: ChatPrompt): Command {
  return prompt.getPromptParts()[1].getPrompt().replace("/", "") as Command;
}

// get the entire prompt without the @tool & /command
function getPrompt(prompt: ChatPrompt): string {
  if (
    prompt.length > 2 &&
    prompt.getPromptParts()[0].getPrompt() === "@data-connect"
  ) {
    return prompt.getPromptParts()[2].getPrompt();
  }
  return prompt.fullPrompt();
}
