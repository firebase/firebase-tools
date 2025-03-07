import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "../backend";
import * as planner from "./planner";
import * as deploymentTool from "../../../deploymentTool";
import * as utils from "../../../utils";
import * as v2events from "../../../functions/events/v2";

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
    triggered: backend.Triggered = { httpsTrigger: {} },
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
      state: "ACTIVE",
    } as backend.Endpoint;
  }

  describe("calculateUpdate", () => {
    it("throws on illegal updates", () => {
      const httpsFunc = func("a", "b", { httpsTrigger: {} });
      const scheduleFunc = func("a", "b", { scheduleTrigger: {} });
      expect(() => planner.calculateUpdate(httpsFunc, scheduleFunc)).to.throw();
    });

    it("allows upgrades of genkit functions from the genkit plugin to firebase-functions SDK", () => {
      const httpsFunc = func("a", "b", { httpsTrigger: {} });
      const genkitFunc = func("a", "b", { callableTrigger: { genkitAction: "flows/flow" } });
      expect(planner.calculateUpdate(genkitFunc, httpsFunc)).to.deep.equal({
        // Missing: deleteAndRecreate
        endpoint: genkitFunc,
        unsafe: false,
      });
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
        unsafe: false,
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
        unsafe: false,
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
        unsafe: false,
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
        unsafe: false,
      });
    });
  });

  describe("toSkipPredicate", () => {
    it("should skip functions with matching hashes", () => {
      const wantFn = func("skip", "region");
      const haveFn = func("skip", "region");
      wantFn.hash = "same-hash";
      haveFn.hash = "same-hash";

      const want = { skip: wantFn };
      const have = { skip: haveFn };

      const result = planner.calculateChangesets(want, have, (e) => e.region);

      expect(result.region.endpointsToSkip).to.have.lengthOf(1);
      expect(result.region.endpointsToSkip[0].id).to.equal("skip");
    });

    it("should not skip functions with different hashes", () => {
      const funcWant = func("func", "region");
      const funcHave = func("func", "region");
      funcWant.hash = "local-hash";
      funcHave.hash = "server-hash";

      const want = { func: funcWant };
      const have = { func: funcHave };

      const result = planner.calculateChangesets(want, have, (e) => e.region);

      expect(result.region.endpointsToSkip).to.have.lengthOf(0);
      expect(result.region.endpointsToUpdate).to.have.lengthOf(1);
      expect(result.region.endpointsToUpdate[0].endpoint.id).to.equal("func");
    });

    it("should not skip functions with missing hash values", () => {
      const func1Want = func("func1", "region");
      const func1Have = func("func1", "region");
      func1Want.hash = "hash";
      // func1Have has no hash

      const func2Want = func("func2", "region");
      const func2Have = func("func2", "region");
      // func2Want has no hash
      func2Have.hash = "hash";

      // Neither has hash
      const func3Want = func("func3", "region");
      const func3Have = func("func3", "region");

      const want = { func1: func1Want, func2: func2Want, func3: func3Want };
      const have = { func1: func1Have, func2: func2Have, func3: func3Have };

      const result = planner.calculateChangesets(want, have, (e) => e.region);

      expect(result.region.endpointsToSkip).to.have.lengthOf(0);
      expect(result.region.endpointsToUpdate).to.have.lengthOf(3);
    });

    it("should not skip functions targeted by --only flag", () => {
      const funcWant = func("func", "region");
      const funcHave = func("func", "region");
      funcWant.hash = "same-hash";
      funcHave.hash = "same-hash";
      funcWant.targetedByOnly = true;

      const want = { func: funcWant };
      const have = { func: funcHave };

      const result = planner.calculateChangesets(want, have, (e) => e.region);

      expect(result.region.endpointsToSkip).to.have.lengthOf(0);
      expect(result.region.endpointsToUpdate).to.have.lengthOf(1);
      expect(result.region.endpointsToUpdate[0].endpoint.id).to.equal("func");
    });

    it("should not skip functions in broken state", () => {
      const funcWant = func("func", "region");
      const funcHave = func("func", "region");
      funcWant.hash = "same-hash";
      funcHave.hash = "same-hash";
      funcHave.state = "FAILED";

      const want = { func: funcWant };
      const have = { func: funcHave };

      const result = planner.calculateChangesets(want, have, (e) => e.region);

      expect(result.region.endpointsToSkip).to.have.lengthOf(0);
      expect(result.region.endpointsToUpdate).to.have.lengthOf(1);
      expect(result.region.endpointsToUpdate[0].endpoint.id).to.equal("func");
    });
  });

  describe("calculateChangesets", () => {
    it("passes a smoke test", () => {
      const created = func("created", "region");
      const updated = func("updated", "region");
      const deleted = func("deleted", "region");
      deleted.labels = deploymentTool.labels();
      const pantheon = func("pantheon", "region");
      const skipWant = func("skip", "region");
      skipWant.hash = "skip";
      const skipHave = func("skip", "region");
      skipHave.hash = "skip";

      const want = { created, updated, skip: skipWant };
      const have = { updated, deleted, pantheon, skip: skipHave };

      // note: pantheon is not updated in any way
      expect(planner.calculateChangesets(want, have, (e) => e.region)).to.deep.equal({
        region: {
          endpointsToCreate: [created],
          endpointsToUpdate: [
            {
              endpoint: updated,
              unsafe: false,
            },
          ],
          endpointsToDelete: [deleted],
          endpointsToSkip: [skipWant],
        },
      });
    });

    it("adds endpoints with matching hashes to skip list", () => {
      // Note: the two functions share the same id
      const updatedWant = func("updated", "region");
      const updatedHave = func("updated", "region");
      // But their hash are the same (aka a no-op function)
      updatedWant.hash = "to_skip";
      updatedHave.hash = "to_skip";

      const want = { updated: updatedWant };
      const have = { updated: updatedHave };

      expect(planner.calculateChangesets(want, have, (e) => e.region)).to.deep.equal({
        region: {
          endpointsToCreate: [],
          endpointsToUpdate: [],
          endpointsToDelete: [],
          endpointsToSkip: [updatedWant],
        },
      });
    });

    it("adds endpoints to update list if they dont have hashes", () => {
      // Note: the two functions share the same id
      const updatedWant = func("updated", "region");
      const updatedHave = func("updated", "region");
      // Their hashes are not set

      const want = { updated: updatedWant };
      const have = { updated: updatedHave };

      expect(planner.calculateChangesets(want, have, (e) => e.region)).to.deep.equal({
        region: {
          endpointsToCreate: [],
          endpointsToUpdate: [
            {
              endpoint: updatedWant,
              unsafe: false,
            },
          ],
          endpointsToDelete: [],
          endpointsToSkip: [],
        },
      });
    });

    it("adds endpoints to update list if they have different hashes", () => {
      // Note: the two functions share the same id
      const updatedWant = func("updated", "region");
      const updatedHave = func("updated", "region");
      // But their hashes are the same (aka a no-op function)
      updatedWant.hash = "local";
      updatedHave.hash = "server";

      const want = { updated: updatedWant };
      const have = { updated: updatedHave };

      expect(planner.calculateChangesets(want, have, (e) => e.region)).to.deep.equal({
        region: {
          endpointsToCreate: [],
          endpointsToUpdate: [
            {
              endpoint: updatedWant,
              unsafe: false,
            },
          ],
          endpointsToDelete: [],
          endpointsToSkip: [],
        },
      });
    });

    it("does not add endpoints to skip list if not targeted for deploy", () => {
      // Note: the two functions share the same id
      const updatedWant = func("updated", "region");
      const updatedHave = func("updated", "region");
      // But their hash are the same (aka a no-op function)
      updatedWant.hash = "to_skip";
      updatedHave.hash = "to_skip";
      updatedWant.targetedByOnly = true;

      const want = { updated: updatedWant };
      const have = { updated: updatedHave };

      expect(planner.calculateChangesets(want, have, (e) => e.region)).to.deep.equal({
        region: {
          endpointsToCreate: [],
          endpointsToUpdate: [
            {
              endpoint: updatedWant,
              unsafe: false,
            },
          ],
          endpointsToDelete: [],
          endpointsToSkip: [],
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
              unsafe: false,
            },
          ],
          endpointsToDelete: [deleted, pantheon],
          endpointsToSkip: [],
        },
      });
    });

    it("logs a message when skipping functions", () => {
      // Create functions with matching hashes that will be skipped
      const skipWant = func("skip", "region");
      const skipHave = func("skip", "region");
      skipWant.hash = "hash";
      skipHave.hash = "hash";

      const want = { skip: skipWant };
      const have = { skip: skipHave };

      planner.calculateChangesets(want, have, (e) => e.region);

      expect(logLabeledBullet).to.have.been.calledWith(
        "functions",
        "Skipping the deploy of unchanged functions.",
      );
    });
  });

  describe("createDeploymentPlan", () => {
    const codebase = "default";

    it("groups deployment by region and memory", () => {
      const region1mem1Created: backend.Endpoint = func("id1", "region1");
      const region1mem1Updated: backend.Endpoint = func("id2", "region1");

      const region2mem1Created: backend.Endpoint = func("id3", "region2");
      const region2mem2Updated: backend.Endpoint = func("id4", "region2");
      region2mem2Updated.availableMemoryMb = 512;
      const region2mem2Deleted: backend.Endpoint = func("id5", "region2");
      region2mem2Deleted.availableMemoryMb = 512;
      region2mem2Deleted.labels = deploymentTool.labels();

      const haveBackend = backend.of(region1mem1Updated, region2mem2Updated, region2mem2Deleted);
      const wantBackend = backend.of(
        region1mem1Created,
        region1mem1Updated,
        region2mem1Created,
        region2mem2Updated,
      );

      expect(planner.createDeploymentPlan({ wantBackend, haveBackend, codebase })).to.deep.equal({
        "default-region1-default": {
          endpointsToCreate: [region1mem1Created],
          endpointsToUpdate: [
            {
              endpoint: region1mem1Updated,
              unsafe: false,
            },
          ],
          endpointsToDelete: [],
          endpointsToSkip: [],
        },
        "default-region2-default": {
          endpointsToCreate: [region2mem1Created],
          endpointsToUpdate: [],
          endpointsToDelete: [],
          endpointsToSkip: [],
        },
        "default-region2-512": {
          endpointsToCreate: [],
          endpointsToUpdate: [
            {
              endpoint: region2mem2Updated,
              unsafe: false,
            },
          ],
          endpointsToDelete: [region2mem2Deleted],
          endpointsToSkip: [],
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

      const wantBackend = backend.of(group1Updated, group1Created, group2Updated, group2Created);
      const haveBackend = backend.of(group1Updated, group1Deleted, group2Updated, group2Deleted);

      expect(
        planner.createDeploymentPlan({
          wantBackend,
          haveBackend,
          codebase,
          filters: [{ codebase, idChunks: ["g1"] }],
        }),
      ).to.deep.equal({
        "default-region-default": {
          endpointsToCreate: [group1Created],
          endpointsToUpdate: [
            {
              endpoint: group1Updated,
              unsafe: false,
            },
          ],
          endpointsToDelete: [group1Deleted],
          endpointsToSkip: [],
        },
      });
    });

    it("nudges users towards concurrency settings when upgrading and not setting", () => {
      const original: backend.Endpoint = func("id", "region");
      original.platform = "gcfv1";
      const upgraded: backend.Endpoint = { ...original };
      upgraded.platform = "gcfv2";

      const haveBackend = backend.of(original);
      const wantBackend = backend.of(upgraded);

      allowV2Upgrades();
      planner.createDeploymentPlan({ wantBackend, haveBackend, codebase });
      expect(logLabeledBullet).to.have.been.calledOnceWith(
        "functions",
        sinon.match(/change this with the 'concurrency' option/),
      );
    });

    it("does not warn users about concurrency when inappropriate", () => {
      allowV2Upgrades();
      // Concurrency isn't set but this isn't an upgrade operation, so there
      // should be no warning
      const v2Function: backend.Endpoint = { ...func("id", "region"), platform: "gcfv2" };

      planner.createDeploymentPlan({
        wantBackend: backend.of(v2Function),
        haveBackend: backend.of(v2Function),
        codebase,
      });
      expect(logLabeledBullet).to.not.have.been.called;

      const v1Function: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
      planner.createDeploymentPlan({
        wantBackend: backend.of(v1Function),
        haveBackend: backend.of(v1Function),
        codebase,
      });
      expect(logLabeledBullet).to.not.have.been.called;

      // Upgraded but specified concurrency
      const concurrencyUpgraded: backend.Endpoint = {
        ...v1Function,
        platform: "gcfv2",
        concurrency: 80,
      };
      planner.createDeploymentPlan({
        wantBackend: backend.of(concurrencyUpgraded),
        haveBackend: backend.of(v1Function),
        codebase,
      });
      expect(logLabeledBullet).to.not.have.been.called;
    });
  });

  describe("checkForUnsafeUpdate", () => {
    it("returns true when upgrading from 2nd gen firestore to firestore auth context triggers", () => {
      const have: backend.Endpoint = {
        ...func("id", "region"),
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          retry: false,
        },
      };
      const want: backend.Endpoint = {
        ...func("id", "region"),
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written.withAuthContext",
          retry: false,
        },
      };
      expect(planner.checkForUnsafeUpdate(want, have)).to.be.true;
    });
  });

  describe("checkForIllegalUpdate", () => {
    // TODO: delete this test once GCF supports upgrading from v1 to v2
    it("prohibits upgrades from v1 to v2", () => {
      const have: backend.Endpoint = { ...func("id", "region"), platform: "gcfv1" };
      const want: backend.Endpoint = { ...func("id", "region"), platform: "gcfv2" };

      expect(() => planner.checkForIllegalUpdate(want, have)).to.throw();
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
