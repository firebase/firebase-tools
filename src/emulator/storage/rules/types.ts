/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
