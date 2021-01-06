import * as sinon from "sinon";

import { mockAuth } from "./";

const authSandbox = sinon.createSandbox();
before(() => {
  mockAuth(authSandbox);
});

after(() => {
  authSandbox.restore();
});
