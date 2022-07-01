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

import { Suite } from "mocha";
import { useFakeTimers } from "sinon";
import supertest = require("supertest");
import { createApp } from "../../../emulator/auth/server";
import { AgentProjectState } from "../../../emulator/auth/state";

export const PROJECT_ID = "example";

/**
 * Describe a test suite about the Auth Emulator, with server setup properly.
 * @param title the title of the test suite
 * @param fn the callback where the suite is defined
 * @return the mocha test suite
 */
export function describeAuthEmulator(
  title: string,
  fn: (this: Suite, utils: AuthTestUtils) => void
): Suite {
  return describe(`Auth Emulator: ${title}`, function (this) {
    let authApp: Express.Application;
    beforeEach("setup or reuse auth server", async function (this) {
      this.timeout(20000);
      authApp = await createOrReuseApp();
    });

    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = useFakeTimers();
    });
    afterEach(() => clock.restore());
    return fn.call(this, { authApi: () => supertest(authApp), getClock: () => clock });
  });
}

export type TestAgent = supertest.SuperTest<supertest.Test>;

export type AuthTestUtils = {
  authApi: () => TestAgent;
  getClock: () => sinon.SinonFakeTimers;
};

// Keep a global auth server since start-up takes too long:
let cachedAuthApp: Express.Application;
const projectStateForId = new Map<string, AgentProjectState>();

async function createOrReuseApp(): Promise<Express.Application> {
  if (!cachedAuthApp) {
    cachedAuthApp = await createApp(PROJECT_ID, projectStateForId);
  }
  // Clear the state every time to make it work like brand new.
  // NOTE: This probably won't work with parallel mode if we ever enable it.
  projectStateForId.clear();
  return cachedAuthApp;
}
