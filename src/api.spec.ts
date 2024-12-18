import { expect } from "chai";
import * as api from "./api.js";
import * as utils from "./utils.js";

describe("api", () => {

  afterEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_URL;

    // This is dirty, but utils keeps stateful overrides and we need to clear it
    utils.envOverrides.length = 0;
  });

  it("should override with FIRESTORE_URL", () => {
    process.env.FIRESTORE_URL = "http://foobar.com";

    expect(api.firestoreOrigin()).to.eq("http://foobar.com");
  });

  it("should prefer FIRESTORE_EMULATOR_HOST to FIRESTORE_URL", () => {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
    process.env.FIRESTORE_URL = "http://foobar.com";

    expect(api.firestoreOriginOrEmulator()).to.eq("http://localhost:8080");
  });
});
