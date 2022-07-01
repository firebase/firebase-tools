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

import { logger } from "../../../../logger";

// A module can be much more complicated than this, but this is all we need so far.
// For a full reference, see https://golang.org/doc/modules/gomod-ref
export interface Module {
  module: string;
  version: string;
  dependencies: Record<string, string>;
  replaces: Record<string, string>;
}

export function parseModule(mod: string): Module {
  const module: Module = {
    module: "",
    version: "",
    dependencies: {},
    replaces: {},
  };
  const lines = mod.split("\n");
  let inBlock: Record<string, string> | undefined = undefined;
  for (const line of lines) {
    if (inBlock) {
      const endRequireMatch = /\)/.exec(line);
      if (endRequireMatch) {
        inBlock = undefined;
        continue;
      }

      let regex: RegExp;
      if (inBlock === module.dependencies) {
        regex = /([^ ]+) ([^ ]+)/;
      } else {
        regex = /([^ ]+) => ([^ ]+)/;
      }
      const mapping = regex.exec(line);
      if (mapping) {
        (inBlock as Record<string, string>)[mapping[1]] = mapping[2];
        continue;
      }

      if (line.trim()) {
        logger.debug("Don't know how to handle line", line, "inside a mod.go require block");
      }
      continue;
    }
    const modMatch = /^module (.*)$/.exec(line);
    if (modMatch) {
      module.module = modMatch[1];
      continue;
    }
    const versionMatch = /^go (\d+\.\d+)$/.exec(line);
    if (versionMatch) {
      module.version = versionMatch[1];
      continue;
    }

    const requireMatch = /^require ([^ ]+) ([^ ]+)/.exec(line);
    if (requireMatch) {
      module.dependencies[requireMatch[1]] = requireMatch[2];
      continue;
    }

    const replaceMatch = /^replace ([^ ]+) => ([^ ]+)$/.exec(line);
    if (replaceMatch) {
      module.replaces[replaceMatch[1]] = replaceMatch[2];
      continue;
    }

    const requireBlockMatch = /^require +\(/.exec(line);
    if (requireBlockMatch) {
      inBlock = module.dependencies;
      continue;
    }

    const replaceBlockMatch = /^replace +\(/.exec(line);
    if (replaceBlockMatch) {
      inBlock = module.replaces;
      continue;
    }

    if (line.trim()) {
      logger.debug("Don't know how to handle line", line, "in mod.go");
    }
  }

  return module;
}
