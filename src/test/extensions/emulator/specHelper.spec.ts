import { expect } from "chai";

import * as specHelper from "../../../extensions/emulator/specHelper";
import { Resource } from "../../../extensions/types";
import { FirebaseError } from "../../../error";

const testResource: Resource = {
  name: "test-resource",
  entryPoint: "functionName",
  type: "firebaseextensions.v1beta.function",
  properties: {
    timeout: "3s",
    location: "us-east1",
    availableMemoryMb: 1024,
  },
};

describe("getRuntime", () => {
  it("gets runtime of resources", () => {
    const r1 = {
      ...testResource,
      properties: {
        runtime: "nodejs14",
      },
    };
    const r2 = {
      ...testResource,
      properties: {
        runtime: "nodejs14",
      },
    };
    expect(specHelper.getRuntime([r1, r2])).to.equal("nodejs14");
  });

  it("chooses the latest runtime if many runtime exists", () => {
    const r1 = {
      ...testResource,
      properties: {
        runtime: "nodejs12",
      },
    };
    const r2 = {
      ...testResource,
      properties: {
        runtime: "nodejs14",
      },
    };
    expect(specHelper.getRuntime([r1, r2])).to.equal("nodejs14");
  });

  it("returns default runtime if none specified", () => {
    const r1 = {
      ...testResource,
      properties: {},
    };
    const r2 = {
      ...testResource,
      properties: {},
    };
    expect(specHelper.getRuntime([r1, r2])).to.equal(specHelper.DEFAULT_RUNTIME);
  });

  it("returns default runtime given no resources", () => {
    expect(specHelper.getRuntime([])).to.equal(specHelper.DEFAULT_RUNTIME);
  });

  it("throws error given invalid runtime", () => {
    const r1 = {
      ...testResource,
      properties: {
        runtime: "dotnet6",
      },
    };
    const r2 = {
      ...testResource,
      properties: {
        runtime: "nodejs14",
      },
    };
    expect(() => specHelper.getRuntime([r1, r2])).to.throw(FirebaseError);
  });
});
