import { AppPlatform, createWebApp, listFirebaseApps } from "../../management/apps";
import { logger } from "../../logger";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";

export async function prepare(context: any, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  const config = options.config.src.auth;

  if (!config) {
    return;
  }

  // We need a Firebase App (Web) to use the Orchestration API
  const apps = await listFirebaseApps(projectId, AppPlatform.WEB);
  let app = apps.find((a) => a.displayName === "Default Web App");

  if (!app && apps.length > 0) {
    // If no "Default Web App", just pick the first one
    app = apps[0];
  }

  if (!app) {
    logger.info("No Firebase Web App found. Creating 'Default Web App' for Auth provisioning...");
    app = await createWebApp(projectId, {
      displayName: "Default Web App",
    });
  }

  context.auth = context.auth || {};
  context.auth.appId = app.appId;
}
