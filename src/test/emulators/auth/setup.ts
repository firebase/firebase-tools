import { Suite } from "mocha";
import { useFakeTimers } from "sinon";
import * as supertest from "supertest";
import { createApp } from "../../../emulator/auth/server";
import { AgentProjectState } from "../../../emulator/auth/state";
import { SingleProjectMode } from "../../../emulator/auth";

export const PROJECT_ID = "example";

/**
 * Describe a test suite about the Auth Emulator, with server setup properly.
 * @param title the title of the test suite
 * @param fn the callback where the suite is defined
 * @return the mocha test suite
 */
export function describeAuthEmulator(
  title: string,
  fn: (this: Suite, utils: AuthTestUtils) => void,
  singleProjectMode = SingleProjectMode.NO_WARNING,
): Suite {
  return describe(`Auth Emulator: ${title}`, function (this) {
    let authApp: Express.Application;
    beforeEach("setup or reuse auth server", async function (this) {
      this.timeout(20000);
      authApp = await createOrReuseApp(singleProjectMode);
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
const cachedAuthAppMap = new Map<SingleProjectMode, Express.Application>();
const projectStateForId = new Map<string, AgentProjectState>();

async function createOrReuseApp(
  singleProjectMode: SingleProjectMode,
): Promise<Express.Application> {
  let cachedAuthApp: Express.Application | undefined = cachedAuthAppMap.get(singleProjectMode);
  if (cachedAuthApp === undefined) {
    cachedAuthApp = await createApp(PROJECT_ID, singleProjectMode, projectStateForId);
    cachedAuthAppMap.set(singleProjectMode, cachedAuthApp);
  }
  // Clear the state every time to make it work like brand new.
  // NOTE: This probably won't work with parallel mode if we ever enable it.
  projectStateForId.clear();
  return cachedAuthApp;
}
