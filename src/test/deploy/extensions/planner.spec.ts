import { expect } from "chai";
import * as sinon from "sinon";

import * as planner from "../../../deploy/extensions/planner";
import * as extensionsApi from "../../../extensions/extensionsApi";

function extensionVersion(version: string): extensionsApi.ExtensionVersion {
  return {
    name: `publishers/test/extensions/test/versions/${version}`,
    ref: `test/test@${version}`,
    state: "PUBLISHED",
    hash: "abc123",
    sourceDownloadUri: "https://google.com",
    spec: {
      name: "test",
      version,
      resources: [],
      sourceUrl: "https://google.com",
      params: [],
    },
  };
}
describe("Extensions Deployment Planner", () => {
  describe("resolveSemver", () => {
    let listExtensionVersionsStub: sinon.SinonStub;

    before(() => {
      listExtensionVersionsStub = sinon
        .stub(extensionsApi, "listExtensionVersions")
        .resolves([
          extensionVersion("0.1.0"),
          extensionVersion("0.1.1"),
          extensionVersion("0.2.0"),
        ]);
    });

    after(() => {
      listExtensionVersionsStub.restore();
    });

    const cases = [
      {
        description: "should return the latest version that satisifies a semver range",
        in: "^0.1.0",
        out: "0.1.1",
        err: false,
      },
      {
        description: "should match exact semver",
        in: "0.2.0",
        out: "0.2.0",
        err: false,
      },
      {
        description: "should resolve latest to a version",
        in: "latest",
        out: "0.2.0",
        err: false,
      },
      {
        description: "should default to latest version",
        out: "0.2.0",
        err: false,
      },
      {
        description: "should error if there is no matching version",
        in: "^0.3.0",
        err: true,
      },
    ];

    for (const c of cases) {
      it(c.description, () => {
        if (!c.err) {
          expect(
            planner.resolveVersion({
              publisherId: "test",
              extensionId: "test",
              version: c.in,
            })
          ).to.eventually.equal(c.out);
        } else {
          expect(
            planner.resolveVersion({
              publisherId: "test",
              extensionId: "test",
              version: c.in,
            })
          ).to.eventually.be.rejected;
        }
      });
    }
  });
});
