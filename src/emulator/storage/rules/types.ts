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

export interface Source {
  files: SourceFile[];
}

export interface SourceFile {
  name: string;
  content: string;
}

export interface RuntimeActionResponse {
  id: number;
  status?: string;
  message?: string;
  warnings: string[];
  errors: string[];
}

export interface RuntimeActionLoadRulesetResponse extends RuntimeActionResponse {
  result: {
    rulesVersion: number;
  };
}

export interface RuntimeActionVerifyResponse extends RuntimeActionResponse {
  result: { permit: boolean };
}

export interface RuntimeActionBundle {
  action: string;
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
    variables: { [s: string]: ExpressionValue };
  };
}

export interface RuntimeActionRequest extends RuntimeActionBundle {
  id: number;
}
