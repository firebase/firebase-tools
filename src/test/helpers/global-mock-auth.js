import sinon from "sinon";
import { before, after } from "mocha";
import esmock from "esmock";

export const globalMocks = 
{
  "../../auth.js": {
    getAccessToken: sinon.stub().resolves({ access_token: "an_access_token" }),
  }
};

esmock()
