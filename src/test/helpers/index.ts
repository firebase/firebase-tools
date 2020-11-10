import * as sinon from "sinon";
import * as auth from "../../auth";

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
