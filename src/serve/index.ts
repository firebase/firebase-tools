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

import { EmulatorServer } from "../emulator/emulatorServer";
import { logger } from "../logger";
import { prepareFrameworks } from "../frameworks";
import { previews } from "../previews";

const { FunctionsServer } = require("./functions");

const TARGETS: {
  [key: string]:
    | EmulatorServer
    | { start: (o: any) => void; stop: (o: any) => void; connect: () => void };
} = {
  hosting: require("./hosting"),
  functions: new FunctionsServer(),
};

/**
 * Serve runs the emulators for a set of targets provided in options.
 * @param options Firebase CLI options.
 */
export async function serve(options: any): Promise<void> {
  const targetNames = options.targets || [];
  options.port = parseInt(options.port, 10);
  if (
    previews.frameworkawareness &&
    targetNames.includes("hosting") &&
    [].concat(options.config.get("hosting")).some((it: any) => it.source)
  ) {
    await prepareFrameworks(targetNames, options, options);
  }
  await Promise.all(
    targetNames.map((targetName: string) => {
      return TARGETS[targetName].start(options);
    })
  );
  await Promise.all(
    targetNames.map((targetName: string) => {
      return TARGETS[targetName].connect();
    })
  );
  await new Promise((resolve) => {
    process.on("SIGINT", () => {
      logger.info("Shutting down...");
      Promise.all(
        targetNames.map((targetName: string) => {
          return TARGETS[targetName].stop(options);
        })
      )
        .then(resolve)
        .catch(resolve);
    });
  });
}
