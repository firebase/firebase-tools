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

import * as clc from "cli-color";

import { logger } from "../../logger";
import { DeploymentType } from "./tasks";

interface ErrorInfo {
  instanceId: string;
  type: DeploymentType;
  message: string;
}

export class ErrorHandler {
  errors: ErrorInfo[] = [];

  record(instanceId: string, type: DeploymentType, message: string): void {
    this.errors.push({
      instanceId,
      type,
      message: message,
    });
  }

  print(): void {
    logger.info("");
    logger.info("Extensions deploy had errors:");
    logger.info("");
    for (const err of this.errors) {
      logger.info(`- ${err.type} ${clc.bold(err.instanceId)}`);
      logger.info(err.message);
      logger.info("");
    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
