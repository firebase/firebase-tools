import { expect } from "chai";

import * as utils from "../utils";

describe("api", () => {
  beforeEach(() => {
    // The api module resolves env var statically so we need to
    // do lazy imports and clear the import each time.
    delete require.cache[require.resolve("../api")];
  });

  afterEach(() => {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    delete process.env.FIREBASE_REALTIME_URL;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_URL;

    // This is dirty, but utils keeps stateful overrides and we need to clear it
    utils.envOverrides.length = 0;
  });

  after(() => {
    delete require.cache[require.resolve("../api")];
  });

  it("should add HTTP to emulator URL with no protocol", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:8080";

    const api = require("../api");
    expect(api.realtimeOriginOrEmulator).to.eq("http://localhost:8080");
  });

  it("should not add HTTP to emulator URL with https:// protocol", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "https://localhost:8080";

    const api = require("../api");
    expect(api.realtimeOriginOrEmulator).to.eq("https://localhost:8080");
  });

  it("should override with FIREBASE_REALTIME_URL", () => {
    process.env.FIREBASE_REALTIME_URL = "http://foobar.com";

    const api = require("../api");
    expect(api.realtimeOriginOrEmulator).to.eq("http://foobar.com");
  });

  it("should prefer FIREBASE_DATABASE_EMULATOR_HOST to FIREBASE_REALTIME_URL", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:8080";
    process.env.FIREBASE_REALTIME_URL = "http://foobar.com";

    const api = require("../api");
    expect(api.realtimeOriginOrEmulator).to.eq("http://localhost:8080");
  });

  it("should override with FIRESTORE_URL", () => {
    process.env.FIRESTORE_URL = "http://foobar.com";

    const api = require("../api");
    expect(api.firestoreOrigin).to.eq("http://foobar.com");
  });

  it("should prefer FIRESTORE_EMULATOR_HOST to FIRESTORE_URL", () => {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
    process.env.FIRESTORE_URL = "http://foobar.com";

    const api = require("../api");
    expect(api.firestoreOriginOrEmulator).to.eq("http://localhost:8080");
  });
});
