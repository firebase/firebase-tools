
import {
  Config,
  sessionId,
  DEFAULT_GEMINI_MODEL,
  CoreToolScheduler,
  GeminiChat,
  ToolCallRequestInfo,
  CompletedToolCall,
  ToolCall,
  LSTool,
  ReadFileTool,
  ShellTool,
  GeminiClient,
  ToolConfirmationOutcome,
  WaitingToolCall,
  WriteFileTool,
  EditTool,
} from '@gemini-cli/core';
import { Part } from '@google/genai';
import * as readline from 'node:readline';
import { logger } from '../logger';
import { confirm } from '../prompt';
import * as clc from "colorette";
import Table from "cli-table3";
import { diffLines } from "diff";
import ora from "ora";

class InteractiveConversation {
  private scheduler!: CoreToolScheduler;
  private chat!: GeminiChat;
  private rl: readline.Interface;
  private isModelTurn = false;
  private conversationFinished: Promise<void>;
  private resolveConversationFinished!: () => void;

  constructor(private config: Config) {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });
    this.conversationFinished = new Promise((resolve) => {
      this.resolveConversationFinished = resolve;
    });
  }

  async initialize() {
    const geminiClient = new GeminiClient(this.config);
    this.chat = await geminiClient.getChat();

    this.scheduler = new CoreToolScheduler({
      config: this.config,
      toolRegistry: this.config.getToolRegistry(),
      onAllToolCallsComplete: this.handleAllToolCallsComplete.bind(this),
      onToolCallsUpdate: this.handleToolCallsUpdate.bind(this),
      getPreferredEditor: () => undefined,
    });

    this.rl.on('line', (line) => {
      if (this.isModelTurn) return;
      if (line.trim().toLowerCase() === 'exit') {
        this.rl.close();
        return;
      }
      this.run(line);
    });

    this.rl.on('close', () => {
      console.log('\nGoodbye!');
      this.resolveConversationFinished();
    });
  }

  private spinner: ora.Ora | undefined;

  private async handleToolCallsUpdate(toolCalls: ToolCall[]) {
    for (const toolCall of toolCalls) {
      if (toolCall.status === 'awaiting_approval') {
        const waitingToolCall = toolCall as WaitingToolCall;
        
        if (waitingToolCall.request.name === "edit_file" || waitingToolCall.request.name === "write_file") {
          const table = new Table({
            head: [clc.bold("File"), clc.bold("Changes")],
            style: { head: [], border: [] }
          });
          const args = waitingToolCall.request.args as { path: string, old?: string, new: string };
          const diff = diffLines(args.old || "", args.new);
          let diffText = "";
          for (const part of diff) {
            if (part.added) {
              diffText += clc.green(part.value);
            } else if (part.removed) {
              diffText += clc.red(part.value);
            } else {
              diffText += clc.gray(part.value);
            }
          }
          table.push([args.path, diffText]);
          logger.info(`\n${table.toString()}`);
        } else {
          logger.info(`[THINKING] Model wants to call ${waitingToolCall.request.name}(${JSON.stringify(waitingToolCall.request.args)})`);
        }

        if (waitingToolCall.confirmationDetails) {
          const { onConfirm } = waitingToolCall.confirmationDetails;
          const message = `The model wants to run the tool: ${waitingToolCall.request.name}. Do you want to proceed?`;
          
          this.rl.pause();
          const proceed = await confirm({ message, default: true });
          this.rl.resume();

          if (proceed) {
              onConfirm(ToolConfirmationOutcome.ProceedOnce);
          } else {
              onConfirm(ToolConfirmationOutcome.Cancel);
          }
        }
      }
      if (toolCall.status === 'executing') {
        this.spinner = ora(`[EXECUTING] Calling tool: ${toolCall.request.name}`).start();
      }
    }
  }

  private async handleAllToolCallsComplete(completedCalls: CompletedToolCall[]) {
    if (this.spinner) {
      this.spinner.stop();
    }
    logger.info(`\n[RESULT] All tools finished executing.`);
    logger.info('[THINKING] Sending results back to the model...\n');

    const responseParts: Part[] = completedCalls.flatMap(
      (call) => call.response.responseParts,
    ) as Part[];
    await this.run(responseParts);
  }

  start(initialMessage: string): Promise<void> {
    console.log('Interactive chat started. Type "exit" to quit.');
    this.run(initialMessage);
    return this.conversationFinished;
  }

  async run(message: string | Part[]) {
    this.isModelTurn = true;
    const abortController = new AbortController();
    const stream = await this.chat.sendMessageStream({
      message,
      config: {
        abortSignal: abortController.signal,
        tools: [{ functionDeclarations: (await this.config.getToolRegistry()).getFunctionDeclarations() }],
      },
    });

    const toolCallRequests: ToolCallRequestInfo[] = [];
    let finalResponse = '';

    for await (const event of stream) {
      if (event.functionCalls) {
        toolCallRequests.push(
          ...event.functionCalls.map(
            (fc) =>
              ({
                callId: fc.id ?? `${fc.name}-${Date.now()}`,
                name: fc.name,
                args: fc.args,
              }) as ToolCallRequestInfo,
          ),
        );
      }
      if (event.candidates?.[0]?.content?.parts) {
        for (const part of event.candidates[0].content.parts) {
          if (part.text) {
            process.stdout.write(part.text);
            finalResponse += part.text;
          }
        }
      }
    }

    if (toolCallRequests.length > 0) {
      this.scheduler.schedule(toolCallRequests, abortController.signal);
    } else {
      console.log();
      this.isModelTurn = false;
      this.rl.prompt();
    }
  }
}

export async function startChat(error: Error, logs?: string[]) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set.');
  }

  const config = new Config({
    sessionId,
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    contentGeneratorConfig: {
      apiKey: process.env.GEMINI_API_KEY,
      model: DEFAULT_GEMINI_MODEL,
    },
    coreTools: [LSTool.Name, ReadFileTool.Name, ShellTool.Name, WriteFileTool.Name, EditTool.Name],
  });

  const conversation = new InteractiveConversation(config);
  await conversation.initialize();
  let initialMessage = `I encountered the following error during deployment: ${error.message}.`;
  if (logs) {
    initialMessage += `\n\nHere are the deployment logs:\n${logs.join("\n")}`;
  }
  initialMessage += "\n\nCan you help me debug it? Note: When using shell commands, please run them in the foreground to avoid issues with process tracking.";
  await conversation.start(initialMessage);
}

