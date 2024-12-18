import sinon from "sinon";
import { before, after } from "mocha";
import { mockAuth } from "./index.js";

const authSandbox = sinon.createSandbox();
before(() => {
  mockAuth(authSandbox);
});

after(() => {
  authSandbox.restore();
});
