import { expect } from "chai";
import * as deploymentPlanner from "../../../deploy/functions/deploymentPlanner";

describe("deploymentPlanner", () => {
  describe("functionsByRegion", () => {
    it("should handle default region", () => {
      const triggers = [
        {
          name: "myFunc",
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "myOtherFunc",
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
      ];

      expect(deploymentPlanner.functionsByRegion("myProject", triggers)).to.deep.equal({
        "us-central1": [
          {
            name: "projects/myProject/locations/us-central1/functions/myFunc",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
          {
            name: "projects/myProject/locations/us-central1/functions/myOtherFunc",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
      });
    });

    it("should handle customized region", () => {
      const triggers = [
        {
          name: "myFunc",
          regions: ["us-east1"],
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "myOtherFunc",
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
      ];

      expect(deploymentPlanner.functionsByRegion("myProject", triggers)).to.deep.equal({
        "us-east1": [
          {
            name: "projects/myProject/locations/us-east1/functions/myFunc",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
        "us-central1": [
          {
            name: "projects/myProject/locations/us-central1/functions/myOtherFunc",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
      });
    });

    it("should handle multiple customized region for a function", () => {
      const triggers = [
        {
          name: "myFunc",
          regions: ["us-east1", "eu-west1"],
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
      ];

      expect(deploymentPlanner.functionsByRegion("myProject", triggers)).to.deep.equal({
        "eu-west1": [
          {
            name: "projects/myProject/locations/eu-west1/functions/myFunc",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
        "us-east1": [
          {
            name: "projects/myProject/locations/us-east1/functions/myFunc",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
      });
    });
  });

  describe("createDeploymentPlan", () => {
    it("should put new functions into functionsToCreate", () => {
      const regionMap: deploymentPlanner.RegionMap = {
        "us-east1": [
          {
            name: "projects/a/locations/us-east1/functions/c",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
          {
            name: "projects/a/locations/us-east1/functions/d",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
        "us-west1": [
          {
            name: "projects/a/locations/us-west1/functions/d",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
      };
      const existingFunctions: deploymentPlanner.CloudFunctionTrigger[] = [];
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(
        regionMap,
        existingFunctions,
        filters
      );

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: [
          {
            region: "us-east1",
            functionsToCreate: [
              {
                name: "projects/a/locations/us-east1/functions/c",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
              {
                name: "projects/a/locations/us-east1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
            ],
            functionsToUpdate: [],
            schedulesToUpsert: [],
          },
          {
            region: "us-west1",
            functionsToCreate: [
              {
                name: "projects/a/locations/us-west1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
            ],
            functionsToUpdate: [],
            schedulesToUpsert: [],
          },
        ],
        functionsToDelete: [],
        schedulesToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should put existing functions being deployed into functionsToUpdate", () => {
      const regionMap: deploymentPlanner.RegionMap = {
        "us-east1": [
          {
            name: "projects/a/locations/us-east1/functions/c",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
          {
            name: "projects/a/locations/us-east1/functions/d",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
        "us-west1": [
          {
            name: "projects/a/locations/us-west1/functions/d",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
      };
      const existingFunctions: deploymentPlanner.CloudFunctionTrigger[] = [
        {
          name: "projects/a/locations/us-east1/functions/c",
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "projects/a/locations/us-east1/functions/d",
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "projects/a/locations/us-west1/functions/d",
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
      ];
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(
        regionMap,
        existingFunctions,
        filters
      );

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: [
          {
            region: "us-east1",
            functionsToCreate: [],
            functionsToUpdate: [
              {
                name: "projects/a/locations/us-east1/functions/c",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
              {
                name: "projects/a/locations/us-east1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
            ],
            schedulesToUpsert: [],
          },
          {
            region: "us-west1",
            functionsToCreate: [],
            functionsToUpdate: [
              {
                name: "projects/a/locations/us-west1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
            ],
            schedulesToUpsert: [],
          },
        ],
        functionsToDelete: [],
        schedulesToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should delete existing functions not in local code, only if they were deployed via CLI", () => {
      const regionMap: deploymentPlanner.RegionMap = {};
      const existingFunctions: deploymentPlanner.CloudFunctionTrigger[] = [
        {
          name: "projects/a/locations/us-east1/functions/c",
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "projects/a/locations/us-east1/functions/d",
          labels: {
            "deployment-tool": "cli-firebase",
          },
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "projects/a/locations/us-west1/functions/d",
          labels: {
            "deployment-tool": "cli-firebase",
          },
          environmentVariables: {},
          entryPoint: "",
        },
      ];
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(
        regionMap,
        existingFunctions,
        filters
      );

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: [],
        functionsToDelete: [
          "projects/a/locations/us-east1/functions/d",
          "projects/a/locations/us-west1/functions/d",
        ],
        schedulesToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should create schedules for new or updated scheduled functions", () => {
      const regionMap: deploymentPlanner.RegionMap = {
        "us-east1": [
          {
            name: "projects/a/locations/us-east1/functions/c",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
            schedule: { schedule: "every 20 minutes" },
            eventTrigger: {},
          },
          {
            name: "projects/a/locations/us-east1/functions/d",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
            schedule: { schedule: "every 5 minutes" },
            eventTrigger: {},
          },
        ],
        "us-west1": [
          {
            name: "projects/a/locations/us-west1/functions/d",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
            schedule: { schedule: "every 5 minutes" },
            eventTrigger: {},
          },
        ],
      };
      const existingFunctions: deploymentPlanner.CloudFunctionTrigger[] = [
        {
          name: "projects/a/locations/us-east1/functions/c",
          labels: {},
          environmentVariables: {},
          entryPoint: "",
        },
      ];
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(
        regionMap,
        existingFunctions,
        filters
      );

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: [
          {
            region: "us-east1",
            functionsToCreate: [
              {
                name: "projects/a/locations/us-east1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
                schedule: { schedule: "every 5 minutes" },
                eventTrigger: { resource: "projects/a/topics/firebase-schedule-d-us-east1" },
              },
            ],
            functionsToUpdate: [
              {
                name: "projects/a/locations/us-east1/functions/c",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
                schedule: { schedule: "every 20 minutes" },
                eventTrigger: { resource: "projects/a/topics/firebase-schedule-c-us-east1" },
              },
            ],
            schedulesToUpsert: [
              {
                name: "projects/a/locations/us-east1/functions/c",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
                schedule: { schedule: "every 20 minutes" },
                eventTrigger: { resource: "projects/a/topics/firebase-schedule-c-us-east1" },
              },
              {
                name: "projects/a/locations/us-east1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
                schedule: { schedule: "every 5 minutes" },
                eventTrigger: { resource: "projects/a/topics/firebase-schedule-d-us-east1" },
              },
            ],
          },
          {
            region: "us-west1",
            functionsToCreate: [
              {
                name: "projects/a/locations/us-west1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
                schedule: { schedule: "every 5 minutes" },
                eventTrigger: { resource: "projects/a/topics/firebase-schedule-d-us-west1" },
              },
            ],
            functionsToUpdate: [],
            schedulesToUpsert: [
              {
                name: "projects/a/locations/us-west1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
                schedule: { schedule: "every 5 minutes" },
                eventTrigger: { resource: "projects/a/topics/firebase-schedule-d-us-west1" },
              },
            ],
          },
        ],
        functionsToDelete: [],
        schedulesToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should delete schedules if the function is deleted or updated to another type", () => {
      const regionMap: deploymentPlanner.RegionMap = {
        "us-east1": [
          {
            name: "projects/a/locations/us-east1/functions/d",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
      };
      const existingFunctions: deploymentPlanner.CloudFunctionTrigger[] = [
        {
          name: "projects/a/locations/us-east1/functions/c",
          labels: {
            "deployment-tool": "cli-firebase",
            "deployment-scheduled": "true",
          },
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "projects/a/locations/us-east1/functions/d",
          labels: {
            "deployment-tool": "cli-firebase",
            "deployment-scheduled": "true",
          },
          environmentVariables: {},
          entryPoint: "",
        },
      ];
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(
        regionMap,
        existingFunctions,
        filters
      );

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: [
          {
            region: "us-east1",
            functionsToCreate: [],
            functionsToUpdate: [
              {
                name: "projects/a/locations/us-east1/functions/d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
            ],
            schedulesToUpsert: [],
          },
        ],
        functionsToDelete: ["projects/a/locations/us-east1/functions/c"],
        schedulesToDelete: [
          "projects/a/locations/us-east1/functions/d",
          "projects/a/locations/us-east1/functions/c",
        ],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should only create, update, and delete matching functions if filters are passed in.", () => {
      const regionMap: deploymentPlanner.RegionMap = {
        "us-east1": [
          {
            name: "projects/a/locations/us-east1/functions/group-d",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
          {
            name: "projects/a/locations/us-east1/functions/group-a",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
      };
      const existingFunctions: deploymentPlanner.CloudFunctionTrigger[] = [
        {
          name: "projects/a/locations/us-east1/functions/group-c",
          labels: {
            "deployment-tool": "cli-firebase",
            "deployment-scheduled": "true",
          },
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "projects/a/locations/us-east1/functions/group-d",
          labels: {
            "deployment-tool": "cli-firebase",
          },
          environmentVariables: {},
          entryPoint: "",
        },
        {
          name: "projects/a/locations/us-east1/functions/differentGroup-a",
          labels: {
            "deployment-tool": "cli-firebase",
            "deployment-scheduled": "true",
          },
          environmentVariables: {},
          entryPoint: "",
        },
      ];
      const filters: string[][] = [["group"]];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(
        regionMap,
        existingFunctions,
        filters
      );

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: [
          {
            region: "us-east1",
            functionsToCreate: [
              {
                name: "projects/a/locations/us-east1/functions/group-a",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
            ],
            functionsToUpdate: [
              {
                name: "projects/a/locations/us-east1/functions/group-d",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
            ],
            schedulesToUpsert: [],
          },
        ],
        functionsToDelete: ["projects/a/locations/us-east1/functions/group-c"],
        schedulesToDelete: ["projects/a/locations/us-east1/functions/group-c"],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });

    it("should preserve existing environment variables", () => {
      const regionMap: deploymentPlanner.RegionMap = {
        "us-east1": [
          {
            name: "projects/a/locations/us-east1/functions/a",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
        "us-west1": [
          {
            name: "projects/a/locations/us-west1/functions/b",
            labels: {},
            environmentVariables: {},
            entryPoint: "",
          },
        ],
      };
      const existingFunctions: deploymentPlanner.CloudFunctionTrigger[] = [
        {
          name: "projects/a/locations/us-west1/functions/b",
          labels: {},
          environmentVariables: { FOO: "bar" },
          entryPoint: "",
        },
      ];
      const filters: string[][] = [];

      const deploymentPlan = deploymentPlanner.createDeploymentPlan(
        regionMap,
        existingFunctions,
        filters
      );

      const expected: deploymentPlanner.DeploymentPlan = {
        regionalDeployments: [
          {
            region: "us-east1",
            functionsToCreate: [
              {
                name: "projects/a/locations/us-east1/functions/a",
                labels: {},
                environmentVariables: {},
                entryPoint: "",
              },
            ],
            functionsToUpdate: [],
            schedulesToUpsert: [],
          },
          {
            region: "us-west1",
            functionsToCreate: [],
            functionsToUpdate: [
              {
                name: "projects/a/locations/us-west1/functions/b",
                labels: {},
                environmentVariables: { FOO: "bar" },
                entryPoint: "",
              },
            ],
            schedulesToUpsert: [],
          },
        ],
        functionsToDelete: [],
        schedulesToDelete: [],
      };
      expect(deploymentPlan).to.deep.equal(expected);
    });
  });
});
