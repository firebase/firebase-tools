import { expect } from "chai";
import * as nock from "nock";

import { resourceManagerOrigin } from "../../api";
import * as iam from "../../gcp/iam";

describe("iam", () => {
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
        nock(resourceManagerOrigin)
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
