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

import { EmulatorInfo, EmulatorInstance, Emulators } from "../../emulator/types";
import * as express from "express";
import { createDestroyer } from "../../utils";

/**
 * A thing that acts like an emulator by just occupying a port.
 */
export class FakeEmulator implements EmulatorInstance {
  private exp: express.Express;
  private destroyServer?: () => Promise<void>;

  constructor(public name: Emulators, public host: string, public port: number) {
    this.exp = express();
  }

  start(): Promise<void> {
    const server = this.exp.listen(this.port);
    this.destroyServer = createDestroyer(server);
    return Promise.resolve();
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }
  getInfo(): EmulatorInfo {
    return {
      name: this.getName(),
      host: this.host,
      port: this.port,
    };
  }
  getName(): Emulators {
    return this.name;
  }
}
