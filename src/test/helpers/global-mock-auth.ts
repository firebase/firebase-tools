import * as sinon from "sinon";

import { mockAuth } from "./index.js";

const authSandbox = sinon.createSandbox();
before(() => {
  mockAuth(authSandbox);
});

after(() => {
  authSandbox.restore();
});
