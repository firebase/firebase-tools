import { Suite } from "mocha";
import { useFakeTimers } from "sinon";
import supertest = require("supertest");
import { AgentProject, createApp } from "../../../emulator/auth/server";

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
      this.timeout(10000);
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
const projectStateForId = new Map<string, AgentProject>();

async function createOrReuseApp(): Promise<Express.Application> {
  if (!cachedAuthApp) {
    cachedAuthApp = await createApp(PROJECT_ID, projectStateForId);
  }
  // Clear the state every time to make it work like brand new.
  // NOTE: This probably won't work with parallel mode if we ever enable it.
  projectStateForId.clear();
  return cachedAuthApp;
}
