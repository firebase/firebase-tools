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

import { Emulators } from "../../emulator/types";
import { EmulatorRegistry } from "../../emulator/registry";
import { expect } from "chai";
import { FakeEmulator } from "./fakeEmulator";
import { EmulatorServer } from "../../emulator/emulatorServer";
import { findAvailablePort } from "../../emulator/portUtils";

describe("EmulatorServer", () => {
  it("should correctly start and stop an emulator", async () => {
    const name = Emulators.FUNCTIONS;
    const port = await findAvailablePort("localhost", 5000);
    const emulator = new FakeEmulator(name, "localhost", port);
    const server = new EmulatorServer(emulator);

    await server.start();

    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    expect(EmulatorRegistry.get(name)).to.eql(emulator);

    await server.stop();

    expect(EmulatorRegistry.isRunning(name)).to.be.false;
  });
});
