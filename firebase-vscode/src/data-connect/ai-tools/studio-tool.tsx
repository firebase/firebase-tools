/** @jsx jsx */
/** @jsxFrag jsx.Fragment */
import * as fsai from "@firebase-studio/plugin-sdk/ai";
import {
  UI,
  jsx,
  Agent,
  PromptRequest,
  flattenThread,
  ChatMessage,
  ChatThread,
  parseUserPrompt,
  messageText,
} from "@firebase-studio/plugin-sdk/ai";
import * as vscode from "vscode";
import { ExtensionContext } from "vscode";
import { GeminiToolController } from "./tool-controller";
import { Chat, Command } from "./types";
import { MaybePromise } from "@firebase-studio/plugin-sdk/dist/include/index-EUhzTRmZ";

export const DATACONNECT_TOOL_ID = "dataconnect";
export const DATACONNECT_DISPLAY_NAME = "Data Connect";
export const SUGGESTED_PROMPTS = [
  "/generate_schema Create a schema for a pizza store",
  "/generate_operation Create a mutations for all my types",
];
const HELP_MESSAGE = `
Welcome to the Data Connect Tool. Here you can generate operations and schema. Also some other things!
`;

interface ChatHistory {
  content: string;
  author: string; // typically USER or MODEL
}

export class StudioToolClient implements Agent {
  id = "Data Connect";
  handle = "@DataConnect";
  displayName = "Data Connect Agent";
  description =
    "An agent loaded from the Firebase Data Connect VSCode Extension";
  private history: ChatHistory[] = [];
  icon = vscode.Uri.joinPath(
    this.context.extensionUri,
    "resources",
    "firebase_dataconnect_logo.svg",
  ).toString();
  constructor(
    private context: ExtensionContext,
    private toolController: GeminiToolController,
  ) {}

  async prompt({ thread, reason, response, host }: PromptRequest) {
    let prompt = "";
    let command: string | undefined;

    prompt = reason.startSubthreadWithInput
      ? (reason.startSubthreadWithInput as string)
      : "";

    if (reason.newUserMessage) {
      const parsedPrompt = parseUserPrompt(reason.newUserMessage);
      if (!parsedPrompt.slashCommand) {
        response.markdown(
          "Gemini is unable to complete that request. Try '/generate_schema' or '/generate_operation' to get started.",
        );
        return;
      }
      console.log(parsedPrompt.slashCommand);
      command = parsedPrompt.slashCommand.replace("/", "");
      prompt = parsedPrompt.prompt;
    } else if (reason.startSubthreadWithInput) {
      prompt = reason.startSubthreadWithInput as string;
      command = findCommand(prompt);
    }
    let resp = await this.toolController.handleChat(
      prompt,
      this.threadToHistoryConverter(thread),
      command as Command,
    );
    const code = resp[0];
    response.markdown(code.content);
    response.markdown("What else can I help with?");
    // response.finishThread("All done!");
  }

  threadToHistoryConverter(thread: ChatThread): Chat[] {
    const flattedThread = flattenThread(thread);
    return flattedThread.map((message: ChatMessage) => {
      return {
        author: message.speaker.type,
        content: messageText(message),
      };
    });
  }
  getAvailableCommands(): MaybePromise<fsai.AgentCommand[]> {
    return [
      {
        command: `/${Command.GENERATE_SCHEMA}`,
        description: "Generate a GraphQL schema",
      },
      {
        command: `/${Command.GENERATE_OPERATION}`,
        description: "Generate GraphQL operations",
      },
    ];
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

function findCommand(text: string): string | undefined {
  const words = text.split(/\s+/);
  const command = words.find((word) => word.startsWith("/"));
  return command?.replace("/", "");
}
