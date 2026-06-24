import { z } from "zod";
import { tool } from "../../tool";
import { deploy as coreDeploy, DeployOptions } from "../../../deploy";
import { toContent } from "../../util";
import { jobTracker } from "../../util/jobs";

const TARGETS = {
  hosting: null,
  database: null,
  firestore: null,
  functions: null,
  storage: null,
  remoteconfig: null,
  extensions: null,
  dataconnect: null,
  apphosting: null,
  auth: null,
};

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
          "Comma-separated list of services to deploy. Valid targets are: database, storage, firestore, functions, hosting, remoteconfig, extensions, dataconnect, apphosting, auth.",
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
    const validTargets = Object.keys(TARGETS);
    let targets = validTargets;
    if (only) {
      const parts = only.split(",").map((p) => p.trim());
      targets = parts.filter((p) => validTargets.includes(p));
    }

    const jobId = Date.now().toString();
    jobTracker.createJob(jobId);

    const options = {
      only: only || "",
      except: "",
      filteredTargets: targets,
      project: ctx.projectId,
      projectId: ctx.projectId,
      rc: ctx.rc,
      config: ctx.config,
      nonInteractive: true,
      onProgress: (progress: { phase: string; targets?: string[] }) => {
        type DeployPhase = "predeploy" | "prepare" | "deploy" | "release" | "postdeploy";
        const phaseNumbers: Record<DeployPhase, number> = {
          predeploy: 10,
          prepare: 30,
          deploy: 60,
          release: 80,
          postdeploy: 100,
        };
        const percentage = phaseNumbers[progress.phase as DeployPhase] || 0;
        jobTracker.updateJob(jobId, { progress: percentage });
        jobTracker.addLog(
          jobId,
          `Deploy [${progress.phase}]: Complete for targets ${(progress.targets || []).join(",")}`,
        );
      },
    };

    // Run in background
    void (async () => {
      try {
        const res = await coreDeploy(
          targets as (keyof typeof TARGETS)[],
          options as unknown as DeployOptions,
        );
        jobTracker.updateJob(jobId, { status: "success", progress: 100, result: res });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        jobTracker.updateJob(jobId, { status: "failed", error: message });
      }
    })();

    const contentRes = toContent(
      `Deployment started with Job ID: ${jobId}. Use deploy_status tool to track.`,
    );
    return {
      ...contentRes,
      structuredContent: { jobId, message: "Deployment started" },
    };
  },
);
