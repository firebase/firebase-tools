import * as sinon from "sinon";
import * as auth from "../../auth";

let mockedAuth: sinon.SinonMock | undefined;

/**
 * Mocks getAccessToken so that tests don't take forever.
 * @param sandbox a sinon sandbox.
 */
export function mockAuth(sandbox: sinon.SinonSandbox): void {
  const authMock = sandbox.mock(auth);
  authMock
    .expects("getAccessToken")
    .atLeast(1)
    // eslint-disable-next-line @typescript-eslint/camelcase
    .resolves({ access_token: "an_access_token" });
}

/**
 * Returns the auth sinon mock for tests who must restore the getAccessToken
 * function.
 * @return the sinon mock.
 */
export function getMockedAuth(): sinon.SinonMock | undefined {
  return mockedAuth;
}