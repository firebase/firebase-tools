const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const sinonChai = require("sinon-chai");
const nock = require("nock");
const nodeFetch = require("node-fetch");

// Route global fetch to node-fetch during Mocha tests to support standard nock matching
global.fetch = nodeFetch;
global.Headers = nodeFetch.Headers;
global.Request = nodeFetch.Request;
global.Response = nodeFetch.Response;

if (typeof nodeFetch.Headers.prototype.getSetCookie !== "function") {
  nodeFetch.Headers.prototype.getSetCookie = function () {
    return this.raw()["set-cookie"] || [];
  };
}

// Force nock to execute its side-effects (patching http/https) immediately on load
void nock;

chai.use(chaiAsPromised);
chai.use(sinonChai);

process.on("unhandledRejection", (error) => {
  throw error;
});
