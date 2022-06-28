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

import { Config } from "./config";
import { RC } from "./rc";

// Options come from command-line options and stored config values
// TODO: actually define all of this stuff in command.ts and import it from there.
export interface Options {
  cwd: string;
  configPath: string;
  only: string;
  except: string;
  config: Config;
  filteredTargets: string[];
  force: boolean;

  // Options which are present on every command
  project?: string;
  projectAlias?: string;
  projectId?: string;
  projectNumber?: string;
  projectRoot?: string;
  account?: string;
  json: boolean;
  nonInteractive: boolean;
  interactive: boolean;
  debug: boolean;

  rc: RC;

  // TODO(samstern): Remove this once options is better typed
  [key: string]: unknown;
}
