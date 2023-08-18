import { signal, computed } from "@preact/signals-core";
import { OperationDefinitionNode } from "graphql";

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
  operation: OperationDefinitionNode;
  args?: {};
  results?: {};
}

let executionId = 0;

function nextExecutionId() {
  executionId++;
  return `${executionId}`;
}

export const executions = signal<
  Record<string /** executionId */, ExecutionItem>
>({});

export const selectedExecutionId = signal("");

export const executionArgs = signal({});

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

export function selectExecutionId(executionId: string) {
  selectedExecutionId.value = executionId;
}

export const selectedExecution = computed(
  () => executions.value[selectedExecutionId.value]
);
