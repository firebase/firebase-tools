import { expect } from "chai";

import * as backend from "../../../deploy/functions/backend";
import * as deploymentPlanner from "../../../deploy/functions/deploymentPlanner";
import * as deploymentTool from "../../../deploymentTool";

describe("deploymentPlanner", () => {
  const CLOUD_FUNCTION: Omit<backend.FunctionSpec, "id" | "region"> = {
    apiVersion: 1,
    project: "project",
    runtime: "nodejs14",
    trigger: { allowInsecure: true },
    entryPoint: "function",
  };

  const DEPLOYED_BY_CLI = {
    labels: deploymentTool.labels(),
  };

  function func(id: string, region: string) {
    return {
      ...CLOUD_FUNCTION,
      id,
      region,
    };
  }

  function schedule(schedule: string, target: backend.FunctionSpec): backend.ScheduleSpec {
    return {
      id: backend.scheduleIdForFunction(target),
      project: "p",
      schedule,
      transport: "pubsub",
      targetService: target,
    };
  }

  function topic(target: backend.FunctionSpec): backend.PubSubSpec {
    return {
      id: backend.scheduleIdForFunction(target),
      project: "p",
      targetService: target,
    };
  }

  describe("utility functions", () => {
    it("should partition functions by region", () => {
      const r1f1 = func("r1f1", "us-central1");
      const r1f2 = func("r1f2", "us-central1");
      const r2f1 = func("r2f1", "asia-northeast1");
      const byRegion = deploymentPlanner.functionsByRegion([r1f1, r1f2, r2f1]);

      expect(Object.keys(byRegion).sort()).to.deep.equal(["us-central1", "asia-northeast1"].sort());
      expect(byRegion["us-central1"].sort()).to.deep.equal([r1f1, r1f2].sort());
      expect(byRegion["asia-northeast1"]).to.deep.equal([r2f1]);
    });

    it("should iterate all regions", () => {
      const have = deploymentPlanner.functionsByRegion([
        func("r1f1", "us-central1"),
        func("r2f1", "asia-northeast1"),
      ]);
      const want = deploymentPlanner.functionsByRegion([
        func("r1f1", "us-central1"),
        func("r3f1", "europe-west1"),
      ]);
      const regions = deploymentPlanner.allRegions(have, want);
      expect(regions.sort()).to.deep.equal(
        ["us-central1", "asia-northeast1", "europe-west1"].sort()
      );
    });
  });

  describe("createDeploymentPlan", () => {
    it("should put new functions into functionsToCreate", () => {
      const r1f1 = func("c", "us-east1");
      const r1f2 = func("d", "us-east1");
      const r2f1 = func("d", "us-west1");
      const want: backend.Backend = {
        ...backend.empty(),
        cloudFunctions: [r1f1, r1f2, r2f1],
      };
      const have: backend.Backend = backend.empty();
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, filters);

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: {
          "us-east1": {
            functionsToCreate: [r1f1, r1f2],
            functionsToUpdate: [],
            functionsToDelete: [],
          },
          "us-west1": {
            functionsToCreate: [r2f1],
            functionsToUpdate: [],
            functionsToDelete: [],
          },
        },
        topicsToDelete: [],
        schedulesToUpsert: [],
        schedulesToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should put existing functions being deployed into functionsToUpdate", () => {
      const r1f1 = func("c", "us-east1");
      const r1f2 = func("d", "us-east1");
      const r2f1 = func("d", "us-west1");
      const want: backend.Backend = {
        ...backend.empty(),
        cloudFunctions: [r1f1, r1f2, r2f1],
      };
      const have: backend.Backend = backend.empty();
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, filters);

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: {
          "us-east1": {
            functionsToCreate: [],
            functionsToUpdate: [r1f1, r1f2],
            functionsToDelete: [],
          },
          "us-west1": {
            functionsToCreate: [],
            functionsToUpdate: [r2f1],
            functionsToDelete: [],
          },
        },
        topicsToDelete: [],
        schedulesToUpsert: [],
        schedulesToDelete: [],
      };
    });

    it("should delete existing functions not in local code, only if they were deployed via CLI", () => {
      const pantheonFunc = func("c", "us-east1");
      const cf3FuncR1 = {
        ...CLOUD_FUNCTION,
        ...DEPLOYED_BY_CLI,
        id: "cf3",
        region: "us-east1",
      };
      const cf3FuncR2 = {
        ...CLOUD_FUNCTION,
        ...DEPLOYED_BY_CLI,
        id: "cf3",
        region: "us-west1",
      };
      const have: backend.Backend = {
        ...backend.empty(),
        cloudFunctions: [pantheonFunc, cf3FuncR1, cf3FuncR2],
      };
      const want = backend.empty();
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, filters);

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: {
          "us-east1": {
            functionsToCreate: [],
            functionsToUpdate: [],
            functionsToDelete: [cf3FuncR1],
          },
          "us-west1": {
            functionsToCreate: [],
            functionsToUpdate: [],
            functionsToDelete: [cf3FuncR2],
          },
        },
        topicsToDelete: [],
        schedulesToUpsert: [],
        schedulesToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should create schedules for new or updated scheduled functions", () => {
      // Existing function, existing schedule
      const r1f1 = func("c", "us-east1");
      // New function, HTTPS schedule
      const r1f2 = func("d", "us-east1");
      // Existing function, previously not scheduled
      const r2f1 = func("d", "us-west1");
      const r1sched1 = schedule("every 20 minutes", r1f1);
      const r1sched2 = schedule("every 5 minutes", r1f2);
      const r2sched1 = schedule("every 5 minutes", r2f1);
      const topic1 = topic(r1f1);
      // Schedule 2 uses HTTP transport:
      r1sched2.transport = "https";
      const topic2 = topic(r2f1);

      const want: backend.Backend = {
        requiredAPIs: {},
        cloudFunctions: [r1f1, r1f2, r2f1],
        schedules: [r1sched1, r1sched2, r2sched1],
        topics: [topic1, topic2],
      };
      const have: backend.Backend = {
        requiredAPIs: {},
        cloudFunctions: [r1f1, r2f1],
        schedules: [r1sched1],
        topics: [topic1],
      };
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, filters);

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: {
          "us-east1": {
            functionsToCreate: [r1f2],
            functionsToUpdate: [r1f1],
            functionsToDelete: [],
          },
          "us-west1": {
            functionsToCreate: [],
            functionsToUpdate: [r2f1],
            functionsToDelete: [],
          },
        },
        schedulesToUpsert: [r1sched1, r1sched2, r2sched1],
        schedulesToDelete: [],
        topicsToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should delete schedules if the function is deleted or updated to another type", () => {
      const f1 = { ...func("c", "us-east1"), ...DEPLOYED_BY_CLI };
      const f2 = { ...func("d", "us-east1"), ...DEPLOYED_BY_CLI };
      const schedule1 = schedule("every 1 minutes", f1);
      const schedule2 = schedule("every 1 minutes", f2);
      const topic1 = topic(f1);
      const topic2 = topic(f2);

      // Deployment plan: deleete f1 and the schedule from f2
      const want: backend.Backend = {
        requiredAPIs: {},
        cloudFunctions: [f2],
        schedules: [],
        topics: [topic2],
      };
      const have: backend.Backend = {
        requiredAPIs: {},
        cloudFunctions: [f1, f2],
        schedules: [schedule1, schedule2],
        topics: [topic1, topic2],
      };
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, filters);

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: {
          "us-east1": {
            functionsToCreate: [],
            functionsToUpdate: [f2],
            functionsToDelete: [f1],
          },
        },
        schedulesToUpsert: [],
        schedulesToDelete: [schedule1, schedule2],
        topicsToDelete: [topic1],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should only create, update, and delete matching functions if filters are passed in.", () => {
      // want
      const group1func1 = func("group-a", "us-east1");
      const group1func2 = func("group-d", "us-east1");
      const group2func1 = func("differentGroup-a", "us-east1");
      const group1schedule1 = schedule("every 1 minutes", group1func1);
      const group1topic1 = schedule("every 1 minutes", group1func1);
      const group2schedule1 = schedule("every 1 minutes", group2func1);
      const group2topic1 = topic(group2func1);

      // have:
      // group1func1
      const group1func3 = { ...func("group-c", "us-east1"), ...DEPLOYED_BY_CLI };
      const group1func4 = { ...func("group-c", "us-east1"), ...DEPLOYED_BY_CLI };
      const group2func2 = { ...func("differentGroup-b", "us-east1"), ...DEPLOYED_BY_CLI };
      const group1schedule3 = schedule("every 1 minutes", group1func3);
      const group2schedule2 = schedule("every 1 minutes", group2func2);
      const group1topic3 = topic(group1func3);
      const group2topic2 = topic(group2func2);

      const want: backend.Backend = {
        requiredAPIs: {},
        cloudFunctions: [group1func1, group1func2, group2func1],
        schedules: [group1schedule1, group2schedule1],
        topics: [group1topic1, group2topic1],
      };

      const have: backend.Backend = {
        requiredAPIs: {},
        cloudFunctions: [group1func1, group1func3, group1func4, group2func2],
        schedules: [group1schedule1, group1schedule3, group2schedule2],
        topics: [group1topic1, group1topic3, group2topic2],
      };

      const filters = [["group"]];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, filters);

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: {
          "us-east1": {
            functionsToCreate: [group1func2],
            functionsToUpdate: [group1func1],
            functionsToDelete: [group1func3, group1func4],
          },
        },
        schedulesToUpsert: [group1schedule1],
        schedulesToDelete: [group1schedule3],
        topicsToDelete: [group1topic3],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should preserve existing environment variables", () => {
      const region1 = func("a", "us-east1");
      const region2 = {
        ...func("b", "us-west1"),
        environmentVariables: { BAR: "baz" },
      };
      const oldRegion2: backend.FunctionSpec = {
        ...func("b", "us-west1"),
        environmentVariables: { FOO: "bar" },
      };

      const want: backend.Backend = {
        requiredAPIs: {},
        cloudFunctions: [region1, region2],
        schedules: [],
        topics: [],
      };

      const have: backend.Backend = {
        requiredAPIs: {},
        cloudFunctions: [oldRegion2],
        schedules: [],
        topics: [],
      };
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(want, have, filters);

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: {
          "us-east1": {
            functionsToCreate: [region1],
            functionsToUpdate: [],
            functionsToDelete: [],
          },
          "us-west1": {
            functionsToCreate: [],
            functionsToUpdate: [
              {
                ...region2,
                environmentVariables: {
                  FOO: "bar",
                  BAR: "baz",
                },
              },
            ],
            functionsToDelete: [],
          },
        },
        schedulesToUpsert: [],
        schedulesToDelete: [],
        topicsToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });
  });
});
