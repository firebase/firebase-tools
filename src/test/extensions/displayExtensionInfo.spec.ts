import * as sinon from "sinon";
import { expect } from "chai";

import * as iam from "../../gcp/iam";
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
    let getRoleStub: sinon.SinonStub;
    beforeEach(() => {
      getRoleStub = sinon.stub(iam, "getRole");
      getRoleStub.withArgs("role1").resolves({
        title: "Role 1",
        description: "a role",
      });
      getRoleStub.withArgs("role2").resolves({
        title: "Role 2",
        description: "a role",
      });
    });

    afterEach(() => {
      getRoleStub.restore();
    });
    it("should display info during install", async () => {
      const loggedLines = await displayExtensionInfo.displayExtInfo(SPEC.name, "", SPEC);
      const expected: string[] = [
        "**Name**: Old",
        "**Description**: descriptive",
        "**APIs used by this Extension**:\n  api1 ()\n  api2 ()",
        "\u001b[1m**Roles granted to this Extension**:\n\u001b[22m  Role 1 (a role)\n  Role 2 (a role)",
      ];
      expect(loggedLines.length).to.eql(expected.length);
      expect(loggedLines[0]).to.include("Old");
      expect(loggedLines[1]).to.include("descriptive");
      expect(loggedLines[2]).to.include("api1");
      expect(loggedLines[2]).to.include("api2");
      expect(loggedLines[3]).to.include("Role 1");
      expect(loggedLines[3]).to.include("Role 2");
    });
    it("should display additional information for a published extension", async () => {
      const loggedLines = await displayExtensionInfo.displayExtInfo(
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
        "**APIs used by this Extension**:\n  api1 ()\n  api2 ()",
        "\u001b[1m**Roles granted to this Extension**:\n\u001b[22m  Role 1 (a role)\n  Role 2 (a role)",
      ];
      expect(loggedLines.length).to.eql(expected.length);
      expect(loggedLines[0]).to.include("Old");
      expect(loggedLines[1]).to.include("testpublisher");
      expect(loggedLines[2]).to.include("descriptive");
      expect(loggedLines[3]).to.include("MIT");
      expect(loggedLines[4]).to.include("test.com");
      expect(loggedLines[5]).to.include("api1");
      expect(loggedLines[5]).to.include("api2");
      expect(loggedLines[6]).to.include("Role 1");
      expect(loggedLines[6]).to.include("Role 2");
    });
  });
});
