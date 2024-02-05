import { expect } from "chai";

import * as utils from "../../utils";
import { realtimeOriginOrEmulatorOrCustomUrl, realtimeOriginOrCustomUrl } from "../../database/api";

describe("api", () => {
  afterEach(() => {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    delete process.env.FIREBASE_REALTIME_URL;
    // This is dirty, but utils keeps stateful overrides and we need to clear it
    utils.envOverrides.length = 0;
  });

  it("should add HTTP to emulator URL with no protocol", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:8080";
    expect(realtimeOriginOrEmulatorOrCustomUrl("http://my-custom-url")).to.eq(
      "http://localhost:8080",
    );
  });

  it("should not add HTTP to emulator URL with https:// protocol", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "https://localhost:8080";
    expect(realtimeOriginOrEmulatorOrCustomUrl("http://my-custom-url")).to.eq(
      "https://localhost:8080",
    );
  });

  it("should override with FIREBASE_REALTIME_URL", () => {
    process.env.FIREBASE_REALTIME_URL = "http://foobar.com";
    expect(realtimeOriginOrEmulatorOrCustomUrl("http://my-custom-url")).to.eq("http://foobar.com");
  });

  it("should prefer FIREBASE_DATABASE_EMULATOR_HOST to FIREBASE_REALTIME_URL", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:8080";
    process.env.FIREBASE_REALTIME_URL = "http://foobar.com";
    expect(realtimeOriginOrEmulatorOrCustomUrl("http://my-custom-url")).to.eq(
      "http://localhost:8080",
    );
  });

  it("should prefer FIREBASE_REALTIME_URL when run without emulator", () => {
    process.env.FIREBASE_REALTIME_URL = "http://foobar.com";
    expect(realtimeOriginOrCustomUrl("http://my-custom-url")).to.eq("http://foobar.com");
  });

  it("should ignore FIREBASE_DATABASE_EMULATOR_HOST when run without emulator", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:8080";
    process.env.FIREBASE_REALTIME_URL = "http://foobar.com";
    expect(realtimeOriginOrCustomUrl("http://my-custom-url")).to.eq("http://foobar.com");
  });
});
