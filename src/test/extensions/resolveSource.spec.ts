import { expect } from "chai";
import * as sinon from "sinon";

import * as resolveSource from "../../extensions/resolveSource";

const testRegistryEntry = {
  name: "test-stuff",
  labels: {
    latest: "0.2.0",
  },
  publisher: "firebase",
  versions: {
    "0.1.0": "projects/firebasemods/sources/2kd",
    "0.1.1": "projects/firebasemods/sources/xyz",
    "0.1.2": "projects/firebasemods/sources/123",
    "0.2.0": "projects/firebasemods/sources/abc",
  },
  updateWarnings: {
    ">0.1.0 <0.2.0": [
      {
        from: "0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "After updating, it is highly recommended that you switch your Cloud Scheduler jobs to <b>PubSub</b>",
      },
    ],
    ">=0.2.0": [
      {
        from: "0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "After updating, you must switch your Cloud Scheduler jobs to <b>PubSub</b>, otherwise your extension will stop running.",
      },
      {
        from: ">0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "If you have not already done so during a previous update, after updating, you must switch your Cloud Scheduler jobs to <b>PubSub</b>, otherwise your extension will stop running.",
      },
    ],
  },
};

describe("isPublishedSource", () => {
  it("should return true for an published source", () => {
    const result = resolveSource.isOfficialSource(
      testRegistryEntry,
      "projects/firebasemods/sources/2kd"
    );
    expect(result).to.be.true;
  });

  it("should return false for an unpublished source", () => {
    const result = resolveSource.isOfficialSource(
      testRegistryEntry,
      "projects/firebasemods/sources/invalid"
    );
    expect(result).to.be.false;
  });
});
