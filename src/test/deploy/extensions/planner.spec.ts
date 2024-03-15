import { expect } from "chai";
import * as sinon from "sinon";

import * as planner from "../../../deploy/extensions/planner";
import * as extensionsApi from "../../../extensions/extensionsApi";
import { ExtensionInstance, Extension } from "../../../extensions/types";

function extension(latest?: string, latestApproved?: string): Extension {
  return {
    name: `publishers/test/extensions/test`,
    ref: `test/test`,
    state: "PUBLISHED",
    latestVersion: latest,
    latestApprovedVersion: latestApproved,
    createTime: "",
  };
}
function extensionVersion(version?: string): any {
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
      systemParam: [],
    },
  };
}
describe("Extensions Deployment Planner", () => {
  describe("resolveSemver", () => {
    let listExtensionVersionsStub: sinon.SinonStub;
    before(() => {
      listExtensionVersionsStub = sinon.stub(extensionsApi, "listExtensionVersions").resolves([
        extensionVersion("0.1.0"),
        extensionVersion("0.1.1"),
        extensionVersion("0.2.0"),
        extensionVersion(), // Explicitly test that this doesn't break on bad data
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
        description: "should default to latest-approved version",
        out: "0.1.1",
        err: false,
      },
      {
        description: "should resolve explicit latest-approved",
        in: "latest-approved",
        out: "0.1.1",
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
            planner.resolveVersion(
              {
                publisherId: "test",
                extensionId: "test",
                version: c.in,
              },
              extension("0.2.0", "0.1.1"),
            ),
          ).to.eventually.equal(c.out);
        } else {
          expect(
            planner.resolveVersion(
              {
                publisherId: "test",
                extensionId: "test",
                version: c.in,
              },
              extension("0.2.0", "0.1.1"),
            ),
          ).to.eventually.be.rejected;
        }
      });
    }
  });

  describe("have", () => {
    let listInstancesStub: sinon.SinonStub;

    const SPEC = {
      version: "0.1.0",
      author: {
        authorName: "Firebase",
        url: "https://firebase.google.com",
      },
      resources: [],
      name: "",
      sourceUrl: "",
      params: [],
      systemParams: [],
    };

    const INSTANCE_WITH_EVENTS: ExtensionInstance = {
      name: "projects/my-test-proj/instances/image-resizer",
      createTime: "2019-05-19T00:20:10.416947Z",
      updateTime: "2019-05-19T00:20:10.416947Z",
      state: "ACTIVE",
      serviceAccountEmail: "",
      etag: "123456",
      config: {
        params: {},
        systemParams: {},
        extensionRef: "firebase/image-resizer",
        extensionVersion: "0.1.0",
        name: "projects/my-test-proj/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
        createTime: "2019-05-19T00:20:10.416947Z",
        eventarcChannel: "projects/my-test-proj/locations/us-central1/channels/firebase",
        allowedEventTypes: ["google.firebase.custom-event-occurred"],
        source: {
          state: "ACTIVE",
          spec: SPEC,
          name: "",
          packageUri: "",
          hash: "",
        },
      },
    };

    const INSTANCE_SPEC_WITH_EVENTS: planner.DeploymentInstanceSpec = {
      instanceId: "image-resizer",
      params: {},
      systemParams: {},
      allowedEventTypes: ["google.firebase.custom-event-occurred"],
      eventarcChannel: "projects/my-test-proj/locations/us-central1/channels/firebase",
      etag: "123456",
      ref: {
        publisherId: "firebase",
        extensionId: "image-resizer",
        version: "0.1.0",
      },
    };

    const INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG = JSON.parse(JSON.stringify(INSTANCE_WITH_EVENTS));
    INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG.config.eventarcChannel = undefined;
    INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG.config.allowedEventTypes = undefined;

    const INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG = JSON.parse(
      JSON.stringify(INSTANCE_SPEC_WITH_EVENTS),
    );
    INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG.eventarcChannel = undefined;
    INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG.allowedEventTypes = undefined;

    const INSTANCE_WITH_EMPTY_EVENTS_CONFIG = JSON.parse(JSON.stringify(INSTANCE_WITH_EVENTS));
    INSTANCE_WITH_EMPTY_EVENTS_CONFIG.config.eventarcChannel = "";
    INSTANCE_WITH_EMPTY_EVENTS_CONFIG.config.allowedEventTypes = [];

    const INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG = JSON.parse(
      JSON.stringify(INSTANCE_SPEC_WITH_EVENTS),
    );
    INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG.eventarcChannel = "";
    INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG.allowedEventTypes = [];

    const cases = [
      {
        description: "have() should return correct instance spec with events",
        instances: [INSTANCE_WITH_EVENTS],
        instanceSpecs: [INSTANCE_SPEC_WITH_EVENTS],
      },
      {
        description: "have() should return correct instance spec with undefined events config",
        instances: [INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG],
        instanceSpecs: [INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG],
      },
      {
        description: "have() should return correct instance spec with empty events config",
        instances: [INSTANCE_WITH_EMPTY_EVENTS_CONFIG],
        instanceSpecs: [INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG],
      },
    ];

    for (const c of cases) {
      it(c.description, async () => {
        listInstancesStub = sinon.stub(extensionsApi, "listInstances").resolves(c.instances);
        const have = await planner.have("test");
        expect(have).to.have.same.deep.members(c.instanceSpecs);
        listInstancesStub.restore();
      });
    }
  });
});
