import { expect } from "chai";
import * as displayExtensionInfo from "../../extensions/displayExtensionInfo";
import { ExtensionSpec, Resource } from "../../extensions/types";

const SPEC: ExtensionSpec = {
  name: "test",
  displayName: "Old",
  description: "descriptive",
  version: "0.1.0",
  license: "MIT",
  apis: [
    { apiName: "api1", reason: "" },
    { apiName: "api2", reason: "" },
  ],
  roles: [
    { role: "role1", reason: "" },
    { role: "role2", reason: "" },
  ],
  resources: [
    { name: "resource1", type: "firebaseextensions.v1beta.function", description: "desc" },
    { name: "resource2", type: "other", description: "" } as unknown as Resource,
  ],
  author: { authorName: "Tester", url: "firebase.google.com" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
};

describe("displayExtensionInfo", () => {
  describe("displayExtInfo", () => {
    it("should display info during install", () => {
      const loggedLines = displayExtensionInfo.displayExtInfo(SPEC.name, "", SPEC);
      const expected: string[] = ["**Name**: Old", "**Description**: descriptive"];
      expect(loggedLines).to.eql(expected);
    });
    it("should display additional information for a published extension", () => {
      const loggedLines = displayExtensionInfo.displayExtInfo(
        SPEC.name,
        "testpublisher",
        SPEC,
        true
      );
      const expected: string[] = [
        "**Name**: Old",
        "**Publisher**: testpublisher",
        "**Description**: descriptive",
        "**License**: MIT",
        "**Source code**: test.com",
      ];
      expect(loggedLines).to.eql(expected);
    });
  });
});
