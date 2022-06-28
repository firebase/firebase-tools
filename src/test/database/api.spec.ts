/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";

import * as utils from "../../utils";
import { realtimeOriginOrEmulatorOrCustomUrl, realtimeOriginOrCustomUrl } from "../../database/api";

describe("api", () => {
  afterEach(() => {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    delete process.env.FIREBASE_REALTIME_URL;
    delete process.env.FIREBASE_CLI_PREVIEWS;
    // This is dirty, but utils keeps stateful overrides and we need to clear it
    utils.envOverrides.length = 0;
  });

  it("should add HTTP to emulator URL with no protocol", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:8080";
    expect(realtimeOriginOrEmulatorOrCustomUrl("http://my-custom-url")).to.eq(
      "http://localhost:8080"
    );
  });

  it("should not add HTTP to emulator URL with https:// protocol", () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "https://localhost:8080";
    expect(realtimeOriginOrEmulatorOrCustomUrl("http://my-custom-url")).to.eq(
      "https://localhost:8080"
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
      "http://localhost:8080"
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
