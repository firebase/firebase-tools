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
  SuggestedPromptProvider,
  Variable,
  VariableProvider,
  HandlerButtonOptions,
  ChatContext,
  PromptPart,
  VariableChatContext,
  GeminiTool,
} from "./gca-tool-types";
import { EmulatorsController } from "../../core/emulators";
import {
  getHighlightedText,
  insertToBottomOfActiveFile,
  parseGraphql,
} from "../file-utils";
import { ExtensionContext } from "vscode";
import { Chat, Command } from "./types";
import { GeminiToolController } from "./tool-controller";
import { ChatMessage } from "../../dataconnect/types";
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
    function pushToResponseStream(text: string) {
      const markdown = new vscode.MarkdownString(text);
      responseStream.push(markdown);
    }
    addCodeHandlers(responseStream);
    const chatContext = request.context;
    console.log("harold context: ", chatContext);
    let response: ChatMessage[];

    // parse the prompt
    if (!isPromptValid(request.prompt)) {
      pushToResponseStream(HELP_MESSAGE);
      responseStream.close();
      return;
    }
    const content = getPrompt(request.prompt);
    const command = getCommand(request.prompt);
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

      responseStream.push(new vscode.MarkdownString(errorMessage));
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

/** Start of history management functions */
// function modifyHistory(history: ChatMessage[], type: string): ChatMessage[] {
//   if (type === "operation") {
//     // operation api uses "SERVER" to represent API responses
//     return history.map((item) => {
//       if (item.author === "MODEL") {
//         item.author = "SERVER";
//       }
//       return item;
//     });
//   }
//   return history;
// }

class ChatContextImpl implements ChatContext {
  id: string | vscode.Uri;
  context: string;

  constructor(id: string | vscode.Uri, context: string) {
    this.id = id;
    this.context = context;
  }
  public getText(): string {
    return this.context;
  }
}

class VariableChatContextImpl implements VariableChatContext {
  constructor(
    readonly id: string,
    readonly variable: Variable,
  ) {}

  getText() {
    return this.variable.name;
  }
}

export class VariableImpl implements Variable {
  constructor(
    readonly name: string,
    readonly description?: string,
  ) {}
}

class PromptPartImpl implements PromptPart {
  private prompt: string;

  constructor(e: string) {
    this.prompt = e;
  }

  getPrompt(): string {
    return this.prompt;
  }
}

export function constructPrompt(
  prompt: string,
  schema: string,
  highlighted: string,
) {
  if (highlighted) {
    prompt =
      `This is the Graphql I have currently selected: ${highlighted} \n`.concat(
        prompt,
      );
  }
  if (schema) {
    prompt = `This is my Graphql Schema: ${schema} \n`.concat(prompt);
  }
  return prompt;
}
