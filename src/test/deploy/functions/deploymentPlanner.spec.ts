import { expect } from "chai";

import * as backend from "../../../deploy/functions/backend";
import * as deploymentPlanner from "../../../deploy/functions/deploymentPlanner";
import * as deploymentTool from "../../../deploymentTool";
import * as gcfv2 from "../../../gcp/cloudfunctionsv2";

describe("deploymentPlanner", () => {
  const ENDPOINT: Omit<backend.Endpoint, "id" | "region" | "httpsTriggered"> = {
    platform: "gcfv1",
    project: "project",
    runtime: "nodejs16",
    entryPoint: "function",
  };

  const DEPLOYED_BY_CLI = {
    labels: deploymentTool.labels(),
  };

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
      ...ENDPOINT,
      id,
      region,
      ...triggered,
      environmentVariables: {},
    };
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
      expect(() => deploymentPlanner.calculateUpdate(httpsFunc, scheduleFunc, OPTIONS)).to.throw;
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
      expect(deploymentPlanner.calculateUpdate(changed, original, OPTIONS)).to.deep.equal({
        endpoint: changed,
        deleteAndRecreate: true,
      });
    });

    // TODO: test that upgrades to scheduled functions causes an update in place once
    // upgrades no longer throw.

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
      expect(deploymentPlanner.calculateUpdate(v2Function, v1Function, OPTIONS)).to.deep.equal({
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
      expect(deploymentPlanner.calculateUpdate(updated, original, options)).to.deep.equal({
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
      expect(deploymentPlanner.calculateUpdate(updated, original, OPTIONS)).to.deep.equal({
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
      expect(deploymentPlanner.calculateRegionalChanges(want, have, OPTIONS)).to.deep.equal({
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

      expect(deploymentPlanner.createDeploymentPlan(want, have, options)).to.deep.equal({
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

    // TODO: test that upgrades w/o setting concurrency causes a warning after
    // upgrades no longer throw.
  });

  // N.B. The below unit tests are from a more monolithic/complex version of the codebase.
  // Rather than delete them after the rewrite they were updated to make sure we capture
  // all former subtleties

  describe("createDeploymentPlan", () => {
    it("should put new functions into endpointsToCreate", () => {
      const r1f1 = func("c", "us-east1");
      const r1f2 = func("d", "us-east1");
      const r2f1 = func("d", "us-west1");
      const want = backendOf(r1f1, r1f2, r2f1);
      const have: backend.Backend = backend.empty();
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, { filters });

      const expected: deploymentPlanner.DeploymentPlan = {
        "us-east1": {
          endpointsToCreate: [r1f1, r1f2],
          endpointsToUpdate: [],
          endpointsToDelete: [],
        },
        "us-west1": {
          endpointsToCreate: [r2f1],
          endpointsToUpdate: [],
          endpointsToDelete: [],
        },
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should put existing functions being deployed into endpointsToUpdate", () => {
      const r1f1 = func("c", "us-east1");
      const r1f2 = func("d", "us-east1");
      const r2f1 = func("d", "us-west1");
      const want = backendOf(r1f1, r1f2, r2f1);
      const have = backendOf(r1f1, r1f2, r2f1);
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, { filters });

      const expected: deploymentPlanner.DeploymentPlan = {
        "us-east1": {
          endpointsToCreate: [],
          endpointsToUpdate: [
            {
              endpoint: r1f1,
              deleteAndRecreate: false,
            },
            {
              endpoint: r1f2,
              deleteAndRecreate: false,
            },
          ],
          endpointsToDelete: [],
        },
        "us-west1": {
          endpointsToCreate: [],
          endpointsToUpdate: [
            {
              endpoint: r2f1,
              deleteAndRecreate: false,
            },
          ],
          endpointsToDelete: [],
        },
      };
    });

    it("should delete existing functions not in local code, only if they were deployed via CLI", () => {
      const pantheonFunc = func("c", "us-east1");
      const cf3FuncR1 = {
        ...ENDPOINT,
        ...DEPLOYED_BY_CLI,
        id: "cf3",
        region: "us-east1",
        httpsTrigger: {},
      };
      const cf3FuncR2 = {
        ...ENDPOINT,
        ...DEPLOYED_BY_CLI,
        id: "cf3",
        region: "us-west1",
        httpsTrigger: {},
      };
      const have = backendOf(pantheonFunc, cf3FuncR1, cf3FuncR2);
      const want = backend.empty();
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, { filters });

      const expected: deploymentPlanner.DeploymentPlan = {
        "us-east1": {
          endpointsToCreate: [],
          endpointsToUpdate: [],
          endpointsToDelete: [cf3FuncR1],
        },
        "us-west1": {
          endpointsToCreate: [],
          endpointsToUpdate: [],
          endpointsToDelete: [cf3FuncR2],
        },
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should delete and recreate v2 pubsub functions with changes in topics", () => {
      const f1 = func("pubsub", "us-west1", {
        eventTrigger: {
          eventType: gcfv2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            resource: "projects/aproject/topics/atopic",
          },
          retry: false,
        },
      });
      f1.platform = "gcfv2";
      const f2 = func("pubsub", "us-west1", {
        eventTrigger: {
          eventType: gcfv2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            resource: "projects/aproject/topics/anotherTopic",
          },
          retry: false,
        },
      });
      f2.platform = "gcfv2";

      const want = backendOf(f2);
      const have = backendOf(f1);
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, { filters });

      const expected: deploymentPlanner.DeploymentPlan = {
        "us-west1": {
          endpointsToCreate: [],
          endpointsToUpdate: [
            {
              endpoint: f2,
              deleteAndRecreate: true,
            },
          ],
          endpointsToDelete: [],
        },
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should only create, update, and delete matching functions if filters are passed in.", () => {
      // want
      const group1func1 = func("group-a", "us-east1");
      const group1func2 = func("group-d", "us-east1");
      const group2func1 = func("differentGroup-a", "us-east1");

      // have:
      // group1func1
      const group1func3 = { ...func("group-c", "us-east1"), ...DEPLOYED_BY_CLI };
      const group1func4 = { ...func("group-e", "us-east1"), ...DEPLOYED_BY_CLI };
      const group2func2 = { ...func("differentGroup-b", "us-east1"), ...DEPLOYED_BY_CLI };

      const want = backendOf(group1func1, group1func2, group2func1);
      const have = backendOf(group1func1, group1func3, group1func4, group2func2);

      const filters = [["group"]];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, { filters });

      const expected: deploymentPlanner.DeploymentPlan = {
        "us-east1": {
          endpointsToCreate: [group1func2],
          endpointsToUpdate: [
            {
              endpoint: group1func1,
              deleteAndRecreate: false,
            },
          ],
          endpointsToDelete: [group1func3, group1func4],
        },
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should preserve environment variables", () => {
      const wantEndpoint = {
        ...func("a", "us-west1"),
        environmentVariables: { BAR: "baz" },
      };
      const haveEndpoint = {
        ...func("a", "us-west1"),
        environmentVariables: { FOO: "bar" },
      };
      const want = backendOf(wantEndpoint);
      const have = backendOf(haveEndpoint);
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, { filters });
      expect(
        deploymentPlan["us-west1"].endpointsToUpdate.map(
          (spec) => spec.endpoint.environmentVariables
        )
      ).to.be.deep.equals([{ FOO: "bar", BAR: "baz" }]);
    });

    it("should overwrite environment variables when specified", () => {
      const wantEndpoint = {
        ...func("a", "us-west1"),
        environmentVariables: { BAR: "baz" },
      };
      const haveEndpoint = {
        ...func("a", "us-west1"),
        environmentVariables: { FOO: "bar" },
      };
      const want = backendOf(wantEndpoint);
      const have = backendOf(haveEndpoint);
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, {
        filters,
        overwriteEnvs: true,
      });
      expect(
        deploymentPlan["us-west1"].endpointsToUpdate.map(
          (spec) => spec.endpoint.environmentVariables
        )
      ).to.be.deep.equals([{ BAR: "baz" }]);
    });
  });
});
