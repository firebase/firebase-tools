import * as sinon from "sinon";

import { mockAuth } from "./";

const authSandbox = sinon.createSandbox();

/**
 * Mocha root-hook plugin so mockAuth works in both serial and --parallel modes.
 */
export const mochaHooks = {
  beforeAll(): void {
    mockAuth(authSandbox);
  },
  afterAll(): void {
    authSandbox.restore();
  },
};
