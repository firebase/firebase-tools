import { AnalyticsLogger } from "../analytics";
import { ExtensionBrokerImpl } from "../extension-broker";
import * as vscode from "vscode";
import { DataConnectService } from "./service";
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
} from "./gemini-tool-types";
import { GeminiAssistController } from "./gemini-assist";
import { EmulatorsController } from "../core/emulators";
import {
  getHighlightedText,
  insertToBottomOfActiveFile,
  parseGraphql,
} from "./file-utils";
import { ExtensionContext } from "vscode";
import { InstanceType } from "./code-lens-provider";
import { ObjectTypeDefinitionNode } from "graphql";

export const DATACONNECT_TOOL_ID = "dataconnect";
export const DATACONNECT_DISPLAY_NAME = "Data Connect";
export const SUGGESTED_PROMPTS = [
  "/schema Create a schema for a pizza store",
  "/operation Create a mutations for all my types",
];
const HELP_MESSAGE = `
Welcome to the Data Connect Tool. Here you can generate operations and schema. Also some other things!
`;

interface ChatHistory {
  content: string;
  author: string; // typically USER or MODEL
}

const shouldSendToLLM = false;
export class GeminiToolController implements SuggestedPromptProvider {
  private history: ChatHistory[] = [];
  private lastCommand: "schema" | "operation" | undefined;
  private currentCode: string = "";
  private icon = vscode.Uri.joinPath(
    this.context.extensionUri,
    "resources",
    "firebase_dataconnect_logo.svg",
  );
  constructor(
    private geminiAssistController: GeminiAssistController,
    private fdcService: DataConnectService,
    private emulatorsController: EmulatorsController,
    private context: ExtensionContext,
  ) {}

  async activate() {
    const gemini = vscode.extensions.getExtension<GeminiCodeAssist>(
      "google.geminicodeassist",
    );
    if (!gemini || !gemini.isActive) {
      throw new Error("Gemini extension not found");
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
      tool.registerVariableProvider(
        "type",
        new DataConnectTypeVariableProvider(this.fdcService),
      );
      console.log("HAROLD TOOL REG: ", tool);
    });
  }

  async handleChat(
    request: ChatRequest,
    responseStream: ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const handlePrompt = async (prompt: ChatPrompt): Promise<string> => {
      const promptParts = prompt.getPromptParts();
      for (let i = 0; i < prompt.length; i++) {
        const part = promptParts[i];
        const text = part.getPrompt();

        if (text.startsWith("@")) {
          if (text !== `@${DATACONNECT_TOOL_ID}`) {
            return `Not @${DATACONNECT_TOOL_ID} tool`;
          }
          continue;
        } else if (text.startsWith("/")) {
          // take command + next part of prompt
          const command = text.substring(1);
          // TODO: don't be this dumb and hacky to get prompt
          pushToResponseStream(
            await handleCommand(
              promptParts[i + 1 < prompt.length ? i + 1 : i].getPrompt(),
              command,
            ),
          );
        } else if (text.endsWith("and")) {
          text.replace(new RegExp("and$"), "");
        }
      }
      return "What else would you like to do?";
    };

    const handleCommand = async (
      prompt: string,
      command: string,
    ): Promise<string> => {
      switch (command) {
        case "schema":
          // reset history
          if (this.lastCommand !== "schema") {
            this.lastCommand = "schema";
            this.history = [];
          }
          pushToResponseStream("This is the code that was generated.");
          return await handleGenerateCommand(prompt, "schema");
        case "operation":
          // reset history
          if (this.lastCommand !== "operation") {
            this.lastCommand = "operation";
            this.history = [];
          }
          pushToResponseStream("This is the code that was generated.");
          return await handleGenerateCommand(prompt, "operation");
        case "startEmulators":
          vscode.commands.executeCommand("firebase.emulators.start");
          while (!(await this.emulatorsController.areEmulatorsRunning())) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          return "Emulators started - view terminal.";
        case "execute":
          vscode.commands.executeCommand("fdc.deploy-all");
          if (!(await this.emulatorsController.areEmulatorsRunning())) {
            // TODO: make sep function
            vscode.commands.executeCommand("firebase.emulators.start");
            while (!(await this.emulatorsController.areEmulatorsRunning())) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
          const x = parseGraphql(this.currentCode);
          vscode.commands.executeCommand(
            "firebase.dataConnect.executeOperation",
            x,
            {
              document: this.currentCode || getHighlightedText(),
              documentPath: vscode.window.activeTextEditor?.document.uri.fsPath,
              position: new vscode.Position(0, 0),
            },
            InstanceType.LOCAL,
          );
          return "Operation executed. See execution panel.";
        case "deploy":
          vscode.commands.executeCommand("fdc.deploy-all");
          return "Deploy starting - view terminal.";
        case "help":
          return HELP_MESSAGE;
        case "":
          // if this is in the request chain
          if (this.history.length > 0 && this.lastCommand) {
            return await handleGenerateCommand(prompt, this.lastCommand);
          }
        default:
          return `Unknown command: ${command}`;
      }
    };

    const handleGenerateCommand = async (
      prompt: string,
      type: "schema" | "operation",
    ) => {
      //TODO: deal with non-open editor situation
      const currentDocumentPath =
        vscode.window.activeTextEditor?.document.uri.path;

      // get additional context
      const schema = await this.geminiAssistController.collectSchemaText();
      const highlighted = getHighlightedText();
      prompt = constructPrompt(prompt, schema, highlighted);
      const resp = await this.geminiAssistController.callGenerateApi(
        currentDocumentPath || "",
        prompt,
        type,
        modifyHistory(this.history, type),
      );

      // update chat history for generative api only
      this.history.push({ author: "USER", content: prompt });

      // TODO: add error handling
      const content = resp.output.messages[0].content;
      this.history.push({
        content,
        author: "MODEL",
      });
      this.currentCode = content; // used mainly for operation execution

      return content;
    };

    function pushToResponseStream(text: string) {
      const markdown = new vscode.MarkdownString(text);
      responseStream.push(markdown);
    }

    addCodeHandlers(responseStream);
    const chatContext = request.context;
    console.log("harold context: ", chatContext);
    let response: string;

    try {
      response = await handlePrompt(request.prompt);
    } catch (error) {
      console.log("HAROLD ERROR: ", error);
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
    console.log("harold about to push to stream: ", response);
    console.log("harold context about to push to stream: ", chatContext);

    const markdown = new vscode.MarkdownString(response);

    if (shouldSendToLLM) {
      responseStream.push(markdown);
      // request.context.push(new VariableChatContextImpl("graphql", new VariableImpl(response)));
      request.prompt.splice(
        0,
        request.prompt.length,
        new PromptPartImpl(`Explain the above code`),
      );
    } else {
      responseStream.push(markdown);
      responseStream.close();
    }
  }

  provideSuggestedPrompts(): string[] {
    return SUGGESTED_PROMPTS;
  }
}

class DataConnectCommandProvider implements CommandProvider {
  schemaCommand: CommandDetail = {
    command: "schema",
    description: "Generates a GraphQL schema based on a prompt",
    icon: this.icon,
  };

  operationCommand: CommandDetail = {
    command: "operation",
    description: "Generates a GraphQL query or mutation based on a prompt",
    icon: this.icon,
  };

  startEmulatorCommand: CommandDetail = {
    command: "startEmulators",
    description: "Starts your configured Firebase Emulators",
    icon: this.icon,
  };

  deployCommand: CommandDetail = {
    command: "deploy",
    description: "Deploys your Data Connect instance",
    icon: this.icon,
  };
  executeCommand: CommandDetail = {
    command: "execute",
    description: "Executes an operation locally",
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
      this.startEmulatorCommand,
      this.deployCommand,
      this.executeCommand,
      this.helpCommand,
    ];
    return Promise.resolve(commands);
  }
}

class DataConnectTypeVariableProvider implements VariableProvider {
  constructor(private fdcService: DataConnectService) {}
  async listVariables(): Promise<Variable[]> {
    const introspection = await this.fdcService.introspect();
    console.log(introspection);
    return introspection.data!.__schema.types.map((type) => {
      return {
        name: type.name,
        description: type.description as string,
      };
    });
  }

  typeahead(
    part: string,
    limit: number,
    token: vscode.CancellationToken,
  ): Promise<Variable[]> {
    throw new Error("Method not implemented.");
  }
}

function addCodeHandlers(responseStream: ChatResponseStream) {
  // responseStream.addCodeHandlerButton(
  //   "Execute Graphql",
  //   (codeBlock) => {
  //     vscode.commands.executeCommand("firebase.dataConnect.executeOperation", {
  //       codeBlock,
  //     });
  //   },
  //   { languages: /graphql|graphqllanguage/ },
  // );

  responseStream.addCodeHandlerButton(
    "Insert to bottom of file",
    ({ codeBlock }) => {
      insertToBottomOfActiveFile(codeBlock);
    },
    { languages: /graphql|graphqllanguage/ },
  );
}
function getCommand(prompt: ChatPrompt): string {
  if (prompt.length > 2) {
    return prompt.getPromptParts()[1].getPrompt();
  }
  return "";
}

function getPrompt(prompt: ChatPrompt): string {
  if (prompt.length > 2) {
    return prompt.getPromptParts()[2].getPrompt();
  }
  return prompt.fullPrompt();
}

function modifyHistory(history: ChatHistory[], type: string): ChatHistory[] {
  if (type === "operation") {
    // operation api uses "SERVER" to represent API responses
    return history.map((item) => {
      if (item.author === "MODEL") {
        item.author = "SERVER";
      }
      return item;
    });
  }
  return history;
}

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
