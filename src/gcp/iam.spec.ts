import { expect } from "chai";
import * as nock from "nock";

import { resourceManagerOrigin } from "../api";
import * as iam from "./iam";

const BINDING = {
  role: "some/role",
  members: ["someuser"],
};

describe("iam", () => {
  describe("mergeBindings", () => {
    it("should not update the policy when the bindings are present", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      };

      const updated = iam.mergeBindings(policy, [BINDING]);

      expect(updated).to.be.false;
      expect(policy.bindings).to.deep.equal([BINDING]);
    });

    it("should update the members of a binding in the policy", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      };

      const updated = iam.mergeBindings(policy, [{ role: "some/role", members: ["newuser"] }]);

      expect(updated).to.be.true;
      expect(policy.bindings).to.deep.equal([
        {
          role: "some/role",
          members: ["someuser", "newuser"],
        },
      ]);
    });

    it("should add a new binding to the policy", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [],
      };

      const updated = iam.mergeBindings(policy, [BINDING]);

      expect(updated).to.be.true;
      expect(policy.bindings).to.deep.equal([BINDING]);
    });
  });

  describe("testIamPermissions", () => {
    const tests: {
      desc: string;
      permissionsToCheck: string[];
      permissionsToReturn: string[];
      wantAllowedPermissions: string[];
      wantMissingPermissions?: string[];
      wantedPassed: boolean;
    }[] = [
      {
        desc: "should pass if we have all permissions",
        permissionsToCheck: ["foo", "bar"],
        permissionsToReturn: ["foo", "bar"],
        wantAllowedPermissions: ["foo", "bar"].sort(),
        wantedPassed: true,
      },
      {
        desc: "should fail if we don't have all permissions",
        permissionsToCheck: ["foo", "bar"],
        permissionsToReturn: ["foo"],
        wantAllowedPermissions: ["foo"].sort(),
        wantMissingPermissions: ["bar"].sort(),
        wantedPassed: false,
      },
    ];

    const TEST_RESOURCE = `projects/foo`;

    for (const t of tests) {
      it(t.desc, async () => {
        nock(resourceManagerOrigin())
          .post(`/v1/${TEST_RESOURCE}:testIamPermissions`)
          .matchHeader("x-goog-quota-user", TEST_RESOURCE)
          .reply(200, { permissions: t.permissionsToReturn });

        const res = await iam.testIamPermissions("foo", t.permissionsToCheck);

        expect(res.allowed).to.deep.equal(t.wantAllowedPermissions);
        expect(res.missing).to.deep.equal(t.wantMissingPermissions || []);
        expect(res.passed).to.equal(t.wantedPassed);

        expect(nock.isDone()).to.be.true;
      });
    }
  });
});
