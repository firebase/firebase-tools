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
import { Endpoint } from "../../../../deploy/functions/backend";
import * as database from "../../../../deploy/functions/services/database";

const projectNumber = "123456789";

const endpoint: Endpoint = {
  id: "endpoint",
  region: "us-central1",
  project: projectNumber,
  eventTrigger: {
    retry: false,
    eventType: "google.firebase.database.ref.v1.written",
    eventFilters: {},
    eventFilterPathPatterns: {},
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("ensureDatabaseTriggerRegion", () => {
  it("should set the trigger location to the function region", async () => {
    const ep = { ...endpoint };

    await database.ensureDatabaseTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("us-central1");
  });

  it("should not error if the trigger location is already set correctly", async () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-central1";

    await database.ensureDatabaseTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("us-central1");
  });

  it("should error if the trigger location is set incorrectly", () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-west1";

    expect(() => database.ensureDatabaseTriggerRegion(ep)).to.throw(
      "A database trigger location must match the function region."
    );
  });
});
