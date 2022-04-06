import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "../../../../deploy/functions/backend";
import * as planner from "../../../../deploy/functions/release/planner";
import * as deploymentTool from "../../../../deploymentTool";
import * as utils from "../../../../utils";
import * as v2events from "../../../../functions/events/v2";
import * as projectConfig from "../../../../functions/projectConfig";

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

  describe("calculateUpdate", () => {
    it("throws on illegal updates", () => {
      const httpsFunc = func("a", "b", { httpsTrigger: {} });
      const scheduleFunc = func("a", "b", { scheduleTrigger: {} });
      expect(() => planner.calculateUpdate(httpsFunc, scheduleFunc)).to.throw;
    });

    it("knows to delete & recreate for v2 topic changes", () => {
      const original: backend.Endpoint = {
        ...func("a", "b", {
          eventTrigger: {
            eventType: v2events.PUBSUB_PUBLISH_EVENT,
            eventFilters: { topic: "topic" },
            retry: false,
          },
        }),
        platform: "gcfv2",
      };
      const changed = JSON.parse(JSON.stringify(original)) as backend.Endpoint;
      if (backend.isEventTriggered(changed)) {
        changed.eventTrigger.eventFilters = { topic: "anotherTopic" };
      }
      expect(planner.calculateUpdate(changed, original)).to.deep.equal({
        endpoint: changed,
        deleteAndRecreate: original,
      });
    });

    it("knows to delete & recreate for v1 to v2 scheduled function upgrades", () => {
      const original: backend.Endpoint = {
        ...func("a", "b", { scheduleTrigger: {} }),
        platform: "gcfv1",
      };
      const changed: backend.Endpoint = { ...original, platform: "gcfv2" };

      allowV2Upgrades();
      expect(planner.calculateUpdate(changed, original)).to.deep.equal({
        endpoint: changed,
        deleteAndRecreate: original,
      });
    });

    it("knows to delete & recreate when trigger regions change", () => {
      const original: backend.Endpoint = func("a", "b", {
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          region: "us-west1",
          retry: false,
        },
      });
      original.platform = "gcfv2";
      const changed: backend.Endpoint = func("a", "b", {
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalzied",
          eventFilters: { bucket: "my-bucket" },
          region: "us",
          retry: false,
        },
      });
      changed.platform = "gcfv2";
      allowV2Upgrades();
      expect(planner.calculateUpdate(changed, original)).to.deep.equal({
        endpoint: changed,
        deleteAndRecreate: original,
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
      expect(planner.calculateUpdate(v2Function, v1Function)).to.deep.equal({
        endpoint: v2Function,
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
      expect(planner.calculateChangesets(want, have, (e) => e.region)).to.deep.equal({
        region: {
          endpointsToCreate: [created],
          endpointsToUpdate: [
            {
              endpoint: updated,
            },
          ],
          endpointsToDelete: [deleted],
        },
      });
    });

    it("can be told to delete all functions", () => {
      const created = func("created", "region");
      const updated = func("updated", "region");
      const deleted = func("deleted", "region");
      deleted.labels = deploymentTool.labels();
      const pantheon = func("pantheon", "region");

      const want = { created, updated };
      const have = { updated, deleted, pantheon };

      // note: pantheon is deleted because we have deleteAll: true
      expect(planner.calculateChangesets(want, have, (e) => e.region, true)).to.deep.equal({
        region: {
          endpointsToCreate: [created],
          endpointsToUpdate: [
            {
              endpoint: updated,
            },
          ],
          endpointsToDelete: [deleted, pantheon],
        },
      });
    });
  });

  describe("createDeploymentPlan", () => {
    it("groups deployment by region and memory", () => {
      const region1mem1Created: backend.Endpoint = func("id1", "region1");
      const region1mem1Updated: backend.Endpoint = func("id2", "region1");

      const region2mem1Created: backend.Endpoint = func("id3", "region2");
      const region2mem2Updated: backend.Endpoint = func("id4", "region2");
      region2mem2Updated.availableMemoryMb = 512;
      const region2mem2Deleted: backend.Endpoint = func("id5", "region2");
      region2mem2Deleted.availableMemoryMb = 512;
      region2mem2Deleted.labels = deploymentTool.labels();

      const have = backend.of(region1mem1Updated, region2mem2Updated, region2mem2Deleted);
      const want = backend.of(
        region1mem1Created,
        region1mem1Updated,
        region2mem1Created,
        region2mem2Updated
      );

      expect(planner.createDeploymentPlan(want, have)).to.deep.equal({
        "region1-default": {
          endpointsToCreate: [region1mem1Created],
          endpointsToUpdate: [
            {
              endpoint: region1mem1Updated,
            },
          ],
          endpointsToDelete: [],
        },
        "region2-default": {
          endpointsToCreate: [region2mem1Created],
          endpointsToUpdate: [],
          endpointsToDelete: [],
        },
        "region2-512": {
          endpointsToCreate: [],
          endpointsToUpdate: [
            {
              endpoint: region2mem2Updated,
            },
          ],
          endpointsToDelete: [region2mem2Deleted],
        },
      });
    });

    it("applies filters", () => {
      const group1Created = func("g1-created", "region");
      const group1Updated = func("g1-updated", "region");
      const group1Deleted = func("g1-deleted", "region");

      const group2Created = func("g2-created", "region");
      const group2Updated = func("g2-updated", "region");
      const group2Deleted = func("g2-deleted", "region");

      group1Deleted.labels = deploymentTool.labels();
      group2Deleted.labels = deploymentTool.labels();

      const want = backend.of(group1Updated, group1Created, group2Updated, group2Created);
      const have = backend.of(group1Updated, group1Deleted, group2Updated, group2Deleted);

      expect(
        planner.createDeploymentPlan(want, have, [
          { codebase: projectConfig.DEFAULT_CODEBASE, idChunks: ["g1"] },
        ])
      ).to.deep.equal({
        "region-default": {
          endpointsToCreate: [group1Created],
          endpointsToUpdate: [
            {
              endpoint: group1Updated,
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

      const have = backend.of(original);
      const want = backend.of(upgraded);

      allowV2Upgrades();
      planner.createDeploymentPlan(want, have);
      expect(logLabeledBullet).to.have.been.calledOnceWith(
        "functions",
        sinon.match(/change this with the 'concurrency' option/)
      );
    });

    it("does not warn users about concurrency when inappropriate", () => {
      allowV2Upgrades();
      // Concurrency isn't set but this isn't an upgrade operation, so there
      // should be no warning
      const v2Function: backend.Endpoint = { ...func("id", "region"), platform: "gcfv2" };

      planner.createDeploymentPlan(backend.of(v2Function), backend.of(v2Function));
      expect(logLabeledBullet).to.not.have.been.called;

      const v1Function: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
      planner.createDeploymentPlan(backend.of(v1Function), backend.of(v1Function));
      expect(logLabeledBullet).to.not.have.been.called;

      // Upgraded but specified concurrency
      const concurrencyUpgraded: backend.Endpoint = {
        ...v1Function,
        platform: "gcfv2",
        concurrency: 80,
      };
      planner.createDeploymentPlan(backend.of(concurrencyUpgraded), backend.of(v1Function));
      expect(logLabeledBullet).to.not.have.been.called;
    });
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
      eventType: v2events.PUBSUB_PUBLISH_EVENT,
      eventFilters: { topic: "projects/p/topics/t" },
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
      want.eventTrigger.eventFilters = { topic: "projects/p/topics/t2" };
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
