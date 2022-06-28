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

import { EmulatorHub, Locator, GetEmulatorsResponse } from "./hub";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";

export class EmulatorHubClient {
  private locator: Locator | undefined;

  constructor(private projectId: string) {
    this.locator = EmulatorHub.readLocatorFile(projectId);
  }

  foundHub(): boolean {
    return this.locator !== undefined;
  }

  async getStatus(): Promise<void> {
    const apiClient = new Client({ urlPrefix: this.origin, auth: false });
    await apiClient.get("/");
  }

  async getEmulators(): Promise<GetEmulatorsResponse> {
    const apiClient = new Client({ urlPrefix: this.origin, auth: false });
    const res = await apiClient.get<GetEmulatorsResponse>(EmulatorHub.PATH_EMULATORS);
    return res.body;
  }

  async postExport(path: string): Promise<void> {
    const apiClient = new Client({ urlPrefix: this.origin, auth: false });
    await apiClient.post(EmulatorHub.PATH_EXPORT, { path });
  }

  get origin(): string {
    const locator = this.assertLocator();
    return `http://${locator.host}:${locator.port}`;
  }

  private assertLocator(): Locator {
    if (this.locator === undefined) {
      throw new FirebaseError(`Cannot contact the Emulator Hub for project ${this.projectId}`);
    }

    return this.locator;
  }
}
