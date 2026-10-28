import { AppPlatform, createWebApp, listFirebaseApps } from "../../management/apps";
import { logger } from "../../logger";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";

const DEFAULT_APP_DISPLAY_NAME = "Default Web App";

export async function prepare(context: any, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  const config = options.config.src.auth;

  if (!config) {
    return;
  }

  // We need a Firebase App to use the Orchestration API
  const apps = await listFirebaseApps(projectId, AppPlatform.ANY);
  let app = apps.find((a) => a.displayName === DEFAULT_APP_DISPLAY_NAME) || apps[0];

  if (!app) {
    logger.info(
      `No Firebase App found. Creating '${DEFAULT_APP_DISPLAY_NAME}' for Auth provisioning...`,
    );
    app = await createWebApp(projectId, {
      displayName: DEFAULT_APP_DISPLAY_NAME,
    });
  }

  context.auth = context.auth || {};
  context.auth.appId = app.appId;
  context.auth.platform = app.platform;
}
