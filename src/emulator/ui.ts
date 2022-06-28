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

import { EmulatorInstance, EmulatorInfo, Emulators } from "./types";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorRegistry } from "./registry";
import { FirebaseError } from "../error";
import { Constants } from "./constants";

export interface EmulatorUIOptions {
  port: number;
  host: string;
  projectId: string;
  auto_download?: boolean;
}

export class EmulatorUI implements EmulatorInstance {
  constructor(private args: EmulatorUIOptions) {}

  start(): Promise<void> {
    if (!EmulatorRegistry.isRunning(Emulators.HUB)) {
      throw new FirebaseError(
        `Cannot start ${Constants.description(Emulators.UI)} without ${Constants.description(
          Emulators.HUB
        )}!`
      );
    }
    const hubInfo = EmulatorRegistry.get(Emulators.HUB)!.getInfo();
    const { auto_download, host, port, projectId } = this.args;
    const env: NodeJS.ProcessEnv = {
      HOST: host.toString(),
      PORT: port.toString(),
      GCLOUD_PROJECT: projectId,
      [Constants.FIREBASE_EMULATOR_HUB]: EmulatorRegistry.getInfoHostString(hubInfo),
    };

    return downloadableEmulators.start(Emulators.UI, { auto_download }, env);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return downloadableEmulators.stop(Emulators.UI);
  }

  getInfo(): EmulatorInfo {
    return {
      name: this.getName(),
      host: this.args.host,
      port: this.args.port,
      pid: downloadableEmulators.getPID(Emulators.UI),
    };
  }

  getName(): Emulators {
    return Emulators.UI;
  }
}
