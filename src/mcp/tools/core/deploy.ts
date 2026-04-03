import { z } from "zod";
import { tool } from "../../tool";
import { deploy as coreDeploy } from "../../../deploy";
import { toContent } from "../../util";
import { jobTracker } from "../../util/jobs";

export const deploy = tool(
  "core",
  {
    name: "deploy",
    description:
      "Deploy resources to your Firebase project, based on the contents of firebase.json.",
    inputSchema: z.object({
      only: z
        .string()
        .optional()
        .describe(
          'Comma-separated list of services to deploy. Valid targets are: database, storage, firestore, functions, hosting, remoteconfig, extensions, dataconnect, apphosting, auth.',
        ),
    }),
    annotations: {
      title: "Deploy Firebase Services",
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
      ui: {
        resourceUri: "ui://core/deploy/mcp-app.html",
      },
    },
  },
  async ({ only }, ctx) => {
    const validTargets = [
      "database",
      "storage",
      "firestore",
      "functions",
      "hosting",
      "remoteconfig",
      "extensions",
      "dataconnect",
      "apphosting",
      "auth",
    ];
    let targets = validTargets;
    if (only) {
      const parts = only.split(",").map((p) => p.trim());
      targets = parts.filter((p) => validTargets.includes(p));
    }

    const jobId = Date.now().toString();
    jobTracker.createJob(jobId);

    const options: any = {
      only: only || "",
      except: "",
      filteredTargets: targets,
      project: ctx.projectId,
      projectId: ctx.projectId,
      rc: ctx.rc,
      config: ctx.config,
      nonInteractive: true,
      onProgress: (progress: any) => {
        const phaseNumbers: Record<string, number> = {
          predeploy: 10,
          prepare: 30,
          deploy: 60,
          release: 80,
          postdeploy: 100,
        };
        const percentage = phaseNumbers[progress.phase] || 0;
        jobTracker.updateJob(jobId, { progress: percentage });
        jobTracker.addLog(
          jobId,
          `Deploy [${progress.phase}]: Complete for targets ${progress.targets?.join(",")}`,
        );
      },
    };

    // Run in background
    (async () => {
      try {
        const typedTargets = targets as any; // Cast or specify exact enum
        const res = await coreDeploy(typedTargets, options);
        jobTracker.updateJob(jobId, { status: "success", progress: 100, result: res });
      } catch (err: any) {
        jobTracker.updateJob(jobId, { status: "failed", error: err.message });
      }
    })();

    const contentRes = toContent(`Deployment started with Job ID: ${jobId}. Use deploy_status tool to track.`);
    return {
      ...contentRes,
      structuredContent: { jobId, message: "Deployment started" },
    };
  },
);
