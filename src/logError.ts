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

import { logger } from "./logger";
import * as clc from "cli-color";

/* istanbul ignore next */
export function logError(error: any): void {
  if (error.children && error.children.length) {
    logger.error(clc.bold.red("Error:"), clc.underline(error.message) + ":");
    error.children.forEach((child: any) => {
      let out = "- ";
      if (child.name) {
        out += clc.bold(child.name) + " ";
      }
      out += child.message;

      logger.error(out);
    });
  } else {
    if (error.original) {
      logger.debug(error.original.stack);
    }
    logger.error();
    logger.error(clc.bold.red("Error:"), error.message);
  }
  if (error.context) {
    logger.debug("Error Context:", JSON.stringify(error.context, undefined, 2));
  }
}
