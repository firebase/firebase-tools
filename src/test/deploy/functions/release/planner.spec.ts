import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "../../../../deploy/functions/backend";
import * as planner from "../../../../deploy/functions/release/planner";
import * as deploymentTool from "../../../../deploymentTool";
import * as gcfv2 from "../../../../gcp/cloudfunctionsv2";
import * as utils from "../../../../utils";

describe("planner", () => {
  let logLabeledBullet: sinon.SinonStub;

  function allowV2Upgrades(): void {
    sinon.stub(planner, "checkForV2Upgrade");
  }

  beforeEach(() => {
    logLabeledBullet = sinon.stub(utils, "logLabeledBullet");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  const OPTIONS = {
    filters: [[]] as string[][],
    overwriteEnvs: false,
  };

  function func(
    id: string,
    region: string,
    triggered: backend.Triggered = { httpsTrigger: {} }
  ): backend.Endpoint {
    return {
      id,
      region,
      ...triggered,
      platform: "gcfv1",
      project: "project",
      runtime: "nodejs16",
      entryPoint: "function",
      environmentVariables: {},
    } as backend.Endpoint;
  }

  function backendOf(...endpoints: backend.Endpoint[]): backend.Backend {
    const bkend = { ...backend.empty() };
    for (const endpoint of endpoints) {
      bkend.endpoints[endpoint.region] = bkend.endpoints[endpoint.region] || {};
      if (bkend.endpoints[endpoint.region][endpoint.id]) {
        throw new Error(
          "Bug in test code; trying to create a backend with the same endpiont twice"
        );
      }
      bkend.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    return bkend;
  }

  describe("calculateUpdate", () => {
    it("throws on illegal updates", () => {
      const httpsFunc = func("a", "b", { httpsTrigger: {} });
      const scheduleFunc = func("a", "b", { scheduleTrigger: {} });
      expect(() => planner.calculateUpdate(httpsFunc, scheduleFunc, OPTIONS)).to.throw;
    });

    it("knows to delete & recreate for v2 topic changes", () => {
      const original: backend.Endpoint = {
        ...func("a", "b", {
          eventTrigger: {
            eventType: gcfv2.PUBSUB_PUBLISH_EVENT,
            eventFilters: {
              resource: "topic",
            },
            retry: false,
          },
        }),
        platform: "gcfv2",
      };
      const changed = JSON.parse(JSON.stringify(original)) as backend.Endpoint;
      if (backend.isEventTriggered(changed)) {
        changed.eventTrigger.eventFilters["resource"] = "anotherTopic";
      }
      expect(planner.calculateUpdate(changed, original, OPTIONS)).to.deep.equal({
        endpoint: changed,
        deleteAndRecreate: true,
      });
    });

    it("knows to delete & recreate for v1 to v2 scheduled function upgrades", () => {
      const original: backend.Endpoint = {
        ...func("a", "b", { scheduleTrigger: {} }),
        platform: "gcfv1",
      };
      const changed: backend.Endpoint = { ...original, platform: "gcfv2" };

      allowV2Upgrades();
      expect(planner.calculateUpdate(changed, original, OPTIONS)).to.deep.equal({
        endpoint: changed,
        deleteAndRecreate: true,
      });
    });

    it("knows to upgrade in-place in the general case", () => {
      const v1Function: backend.Endpoint = {
        ...func("a", "b"),
        platform: "gcfv1",
      };
      const v2Function: backend.Endpoint = {
        ...v1Function,
        platform: "gcfv1",
        availableMemoryMb: 512,
      };
      expect(planner.calculateUpdate(v2Function, v1Function, OPTIONS)).to.deep.equal({
        endpoint: v2Function,
        deleteAndRecreate: false,
      });
    });

    it("updates env variables when told", () => {
      const original: backend.Endpoint = {
        ...func("a", "b"),
        environmentVariables: {
          foo: "bar",
        },
      };
      const updated: backend.Endpoint = {
        ...func("a", "b"),
        environmentVariables: {
          baz: "qux",
        },
      };
      const options = {
        ...OPTIONS,
        overwriteEnvs: true,
      };
      expect(planner.calculateUpdate(updated, original, options)).to.deep.equal({
        endpoint: updated,
        deleteAndRecreate: false,
      });
    });

    it("merges env variables when told", () => {
      const original: backend.Endpoint = {
        ...func("a", "b"),
        environmentVariables: {
          foo: "bar",
        },
      };
      const updated: backend.Endpoint = {
        ...func("a", "b"),
        environmentVariables: {
          baz: "qux",
        },
      };
      expect(planner.calculateUpdate(updated, original, OPTIONS)).to.deep.equal({
        endpoint: {
          ...updated,
          environmentVariables: {
            foo: "bar",
            baz: "qux",
          },
        },
        deleteAndRecreate: false,
      });
    });
  });

  describe("calculateRegionalChanges", () => {
    it("passes a smoke test", () => {
      const created = func("created", "region");
      const updated = func("updated", "region");
      const deleted = func("deleted", "region");
      deleted.labels = deploymentTool.labels();
      const pantheon = func("pantheon", "region");

      const want = { created, updated };
      const have = { updated, deleted, pantheon };

      // note: pantheon is not updated in any way
      expect(planner.calculateRegionalChanges(want, have, OPTIONS)).to.deep.equal({
        endpointsToCreate: [created],
        endpointsToUpdate: [
          {
            endpoint: updated,
            deleteAndRecreate: false,
          },
        ],
        endpointsToDelete: [deleted],
      });
    });
  });

  describe("createDeploymentPlan", () => {
    it("applies filters", () => {
      const group1Created = func("g1-created", "region");
      const group1Updated = func("g1-updated", "region");
      const group1Deleted = func("g1-deleted", "region");

      const group2Created = func("g2-created", "region");
      const group2Updated = func("g2-updated", "region");
      const group2Deleted = func("g2-deleted", "region");

      group1Deleted.labels = deploymentTool.labels();
      group2Deleted.labels = deploymentTool.labels();

      const want = backendOf(group1Updated, group1Created, group2Updated, group2Created);
      const have = backendOf(group1Updated, group1Deleted, group2Updated, group2Deleted);

      const options = {
        ...OPTIONS,
        filters: [["g1"]],
      };

      expect(planner.createDeploymentPlan(want, have, options)).to.deep.equal({
        region: {
          endpointsToCreate: [group1Created],
          endpointsToUpdate: [
            {
              endpoint: group1Updated,
              deleteAndRecreate: false,
            },
          ],
          endpointsToDelete: [group1Deleted],
        },
      });
    });

    it("nudges users towards concurrency settings when upgrading and not setting", () => {
      const original: backend.Endpoint = func("id", "region");
      original.platform = "gcfv1";
      const upgraded: backend.Endpoint = { ...original };
      upgraded.platform = "gcfv2";

      const have = backendOf(original);
      const want = backendOf(upgraded);

      allowV2Upgrades();
      planner.createDeploymentPlan(want, have, OPTIONS);
      expect(logLabeledBullet).to.have.been.calledOnceWith(
        "functions",
        sinon.match(/change this with the 'concurrency' option/)
      );
    });
  });

  it("does not warn users about concurrency when inappropriate", () => {
    allowV2Upgrades();
    // Concurrency isn't set but this isn't an upgrade operation, so there
    // should be no warning
    const v2Function: backend.Endpoint = { ...func("id", "region"), platform: "gcfv2" };

    planner.createDeploymentPlan(backendOf(v2Function), backendOf(v2Function), OPTIONS);
    expect(logLabeledBullet).to.not.have.been.called;

    const v1Function: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
    planner.createDeploymentPlan(backendOf(v1Function), backendOf(v1Function), OPTIONS);
    expect(logLabeledBullet).to.not.have.been.called;

    // Upgraded but specified concurrency
    const concurrencyUpgraded: backend.Endpoint = {
      ...v1Function,
      platform: "gcfv2",
      concurrency: 80,
    };
    planner.createDeploymentPlan(backendOf(concurrencyUpgraded), backendOf(v1Function), OPTIONS);
    expect(logLabeledBullet).to.not.have.been.called;
  });

  describe("checkForIllegalUpdate", () => {
    // TODO: delete this test once GCF supports upgrading from v1 to v2
    it("prohibits upgrades from v1 to v2", () => {
      const have: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
      const want: backend.Endpoint = { ...func("id", "region"), platform: "gcfv2" };

      expect(() => planner.checkForIllegalUpdate(want, have)).to.throw;
    });

    it("should throw if a https function would be changed into an event triggered function", () => {
      const want = func("a", "b", {
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {},
          retry: false,
        },
      });
      const have = func("a", "b", { httpsTrigger: {} });

      expect(() => planner.checkForIllegalUpdate(want, have)).to.throw();
    });

    it("should throw if a event triggered function would be changed into an https function", () => {
      const want = func("a", "b", { httpsTrigger: {} });
      const have = func("a", "b", {
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {},
          retry: false,
        },
      });

      expect(() => planner.checkForIllegalUpdate(want, have)).to.throw();
    });

    it("should throw if a scheduled trigger would change into an https function", () => {
      const want = func("a", "b");
      const have = func("a", "b", { scheduleTrigger: {} });

      expect(() => planner.checkForIllegalUpdate(want, have)).to.throw();
    });

    it("should not throw if a event triggered function keeps the same trigger", () => {
      const eventTrigger: backend.EventTrigger = {
        eventType: "google.pubsub.topic.publish",
        eventFilters: {},
        retry: false,
      };
      const want = func("a", "b", { eventTrigger });

      expect(() => planner.checkForIllegalUpdate(want, want)).not.to.throw();
    });

    it("should not throw if a https function stays as a https function", () => {
      const want = func("a", "b");
      const have = func("a", "b");

      expect(() => planner.checkForIllegalUpdate(want, have)).not.to.throw();
    });

    it("should not throw if a scheduled function stays as a scheduled function", () => {
      const want = func("a", "b", { scheduleTrigger: {} });
      const have = func("a", "b", { scheduleTrigger: {} });

      expect(() => planner.checkForIllegalUpdate(want, have)).not.to.throw();
    });

    it("should throw if a user downgrades from v2 to v1", () => {
      const want: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
      const have: backend.Endpoint = { ...func("id", "region"), platform: "gcfv2" };

      expect(() => planner.checkForIllegalUpdate(want, have)).to.throw();
    });
  });

  it("detects changes to v2 pubsub topics", () => {
    const eventTrigger: backend.EventTrigger = {
      eventType: gcfv2.PUBSUB_PUBLISH_EVENT,
      eventFilters: {
        resource: "projects/p/topics/t",
      },
      retry: false,
    };

    let want: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
    let have: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
    expect(planner.changedV2PubSubTopic(want, have)).to.be.false;

    want.platform = "gcfv2";
    expect(planner.changedV2PubSubTopic(want, have)).to.be.false;

    have.platform = "gcfv2";
    expect(planner.changedV2PubSubTopic(want, have)).to.be.false;

    want = {
      ...func("id", "region", { eventTrigger }),
      platform: "gcfv2",
    };
    expect(planner.changedV2PubSubTopic(want, have)).to.be.false;

    have = {
      ...func("id", "region", { eventTrigger }),
      platform: "gcfv2",
    };
    expect(planner.changedV2PubSubTopic(want, have)).to.be.false;

    // want has a shallow copy of eventTrigger, so we need to duplicate it
    // to modify only 'want'
    want = JSON.parse(JSON.stringify(want)) as backend.Endpoint;
    if (backend.isEventTriggered(want)) {
      want.eventTrigger.eventFilters.resource = "projects/p/topics/t2";
    }
    expect(planner.changedV2PubSubTopic(want, have)).to.be.true;
  });

  it("detects upgrades to scheduled functions", () => {
    const v1Https: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
    const v1Scheduled: backend.Endpoint = {
      ...func("id", "region", { scheduleTrigger: {} }),
      platform: "gcfv1",
    };
    const v2Https: backend.Endpoint = { ...func("id", "region"), platform: "gcfv2" };
    const v2Scheduled: backend.Endpoint = {
      ...func("id", "region", { scheduleTrigger: {} }),
      platform: "gcfv2",
    };

    expect(planner.upgradedScheduleFromV1ToV2(v1Https, v1Https)).to.be.false;
    expect(planner.upgradedScheduleFromV1ToV2(v2Https, v1Https)).to.be.false;
    expect(planner.upgradedScheduleFromV1ToV2(v1Scheduled, v1Scheduled)).to.be.false;
    expect(planner.upgradedScheduleFromV1ToV2(v2Scheduled, v2Scheduled)).to.be.false;

    // Invalid case but caught elsewhere
    expect(planner.upgradedScheduleFromV1ToV2(v2Scheduled, v1Https)).to.be.false;
    expect(planner.upgradedScheduleFromV1ToV2(v2Https, v1Scheduled)).to.be.false;

    expect(planner.upgradedScheduleFromV1ToV2(v2Scheduled, v1Scheduled)).to.be.true;
  });
});
