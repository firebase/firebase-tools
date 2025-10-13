import { computed } from "@preact/signals-core";
import { ExecutionResult, OperationDefinitionNode } from "graphql";
import * as vscode from "vscode";
import { globalSignal } from "../../utils/globals";
import { AuthParams } from "../../messaging/protocol";
import { ExecutionInput } from "./execution";

export enum ExecutionState {
  INIT,
  RUNNING,
  CANCELLED,
  ERRORED,
  FINISHED,
}

export interface ExecutionItem {
  executionId: string;
  label: string;
  timestamp: number;
  state: ExecutionState;
  input: ExecutionInput;
  variables: string;
  auth: AuthParams;
  results: ExecutionResult | Error;
}

let executionId = 0;

function nextExecutionId() {
  executionId++;
  return `${executionId}`;
}

export const executions = globalSignal<
  Record<string /** executionId */, ExecutionItem>
>({});

export const selectedExecutionId = globalSignal("");

export function createExecution(
  executionItem: Omit<ExecutionItem, "executionId">
) {
  const item: ExecutionItem = {
    executionId: nextExecutionId(),
    ...executionItem,
  };

  executions.value = {
    ...executions.value,
    [executionId]: item,
  };

  return item;
}

export function updateExecution(
  executionId: string,
  executionItem: ExecutionItem
) {
  executions.value = {
    ...executions.value,
    [executionId]: executionItem,
  };
}

export async function selectExecutionId(executionId: string) {
  selectedExecutionId.value = executionId;

  // take user to operation location in editor
  const { input } = selectedExecution.value;
  await vscode.window.showTextDocument(vscode.Uri.file(input.documentPath), {
    selection: new vscode.Range(input.position, input.position),
  });
}

export const selectedExecution = computed(
  () => executions.value[selectedExecutionId.value]
);
