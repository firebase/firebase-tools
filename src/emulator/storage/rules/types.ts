import { ExpressionValue } from "./expressionValue";

export enum RulesetOperationMethod {
  READ = "read",
  WRITE = "write",
  GET = "get",
  LIST = "list",
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}

export enum DataLoadStatus {
  OK = "ok",
  NOT_FOUND = "not_found",
  INVALID_STATE = "invalid_state",
}

export interface Source {
  files: SourceFile[];
}

export interface SourceFile {
  name: string;
  content: string;
}

export interface RuntimeActionResponse {
  id?: number;
  server_request_id?: number; // Snake case comes from the server
  status?: string;
  action?: string;
  message?: string;
  warnings: string[];
  errors: string[];
}

export interface RuntimeActionLoadRulesetResponse extends RuntimeActionResponse {
  result: {
    rulesVersion: number;
  };
}

export type RuntimeActionVerifyResponse =
  | RuntimeActionVerifyCompleteResponse
  | RuntimeActionFirestoreDataRequest;

export interface RuntimeActionVerifyCompleteResponse extends RuntimeActionResponse {
  result: { permit: boolean };
}

export interface RuntimeActionFirestoreDataRequest extends RuntimeActionResponse {
  action: "fetch_firestore_document";
  context: { path: string };
}

export interface RuntimeActionFirestoreDataResponse
  extends RuntimeActionResponse,
    RuntimeActionBundle {
  result?: unknown;
}

export interface RuntimeActionBundle {
  action?: string;
}

export interface RuntimeActionLoadRulesetBundle extends RuntimeActionBundle {
  action: "load_ruleset";
  context: {
    rulesetName: string;
    source: Source;
  };
}

export interface RuntimeActionVerifyBundle extends RuntimeActionBundle {
  action: "verify";
  context: {
    rulesetName: string;
    service: string;
    path: string;
    method: string;
    delimiter?: string;
    variables: { [s: string]: ExpressionValue };
  };
}

export interface RuntimeActionRequest extends RuntimeActionBundle {
  id: number;
}
