import * as auth from "../../auth.js";

/**
 * Mocks getAccessToken so that tests don't take forever.
 * @param sandbox a sinon sandbox.
 */
export function mockAuth(sandbox) {
  const authMock = sandbox.mock(auth);
  authMock.expects("getAccessToken").atLeast(1).resolves({ access_token: "an_access_token" });
}
