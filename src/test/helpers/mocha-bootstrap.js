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

// Unit tests must never reach real Google APIs: unmatched requests now fail fast with
// NetConnectNotAllowedError instead of depending on network latency (flaky 2000ms timeouts).
// Integration tests (under scripts/) need real outbound network access.
const isIntegrationTest = process.argv.some((arg) =>
  /(^|[/\\])(scripts|dev[/\\]scripts)[/\\]/.test(arg),
);
if (!isIntegrationTest) {
  nock.disableNetConnect();
  nock.enableNetConnect(/^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/);
}

chai.use(chaiAsPromised);
chai.use(sinonChai);

process.on("unhandledRejection", (error) => {
  throw error;
});

let suiteFakes = new Set();

/**
 * Global teardown hook executed after every test case.
 * Hermetically restores Sinon stubs, spies, and mocks created during the test,
 * resets standard Nock HTTP interceptors, and resets custom Undici Nock interceptors if loaded.
 */
function cleanup() {
  if (typeof sinon.getFakes === "function") {
    for (const fake of sinon.getFakes()) {
      if (!suiteFakes.has(fake)) {
        if (typeof fake.restore === "function") {
          fake.restore();
        }
      }
    }
  } else {
    sinon.restore();
  }

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
  beforeEach() {
    suiteFakes = new Set(typeof sinon.getFakes === "function" ? sinon.getFakes() : []);
  },
  afterEach: cleanup,
};
