const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const sinon = require("sinon");
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

/**
 * Global teardown hook executed after every test case.
 * Hermetically restores Sinon stubs, spies, and mocks, resets standard Nock
 * HTTP interceptors, and resets custom Undici Nock interceptors if loaded.
 */
function cleanup() {
  sinon.restore();
  nock.cleanAll();

  // Safely clean up custom nock (src/test/helpers/nock.ts) if required by tests
  for (const key of Object.keys(require.cache)) {
    if (key.endsWith("test/helpers/nock.ts") || key.endsWith("test/helpers/nock.js")) {
      try {
        const mod = require.cache[key];
        if (mod && mod.exports) {
          const customNock = mod.exports.default || mod.exports;
          if (typeof customNock.cleanAll === "function") {
            customNock.cleanAll();
          }
        }
      } catch {
        // Ignore cleanup errors from custom nock
      }
    }
  }
}

exports.mochaHooks = {
  afterEach: cleanup,
};
