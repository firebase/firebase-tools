"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webApps = void 0;
const apps_1 = require("../management/apps");
const error_1 = require("../error");
const utils_1 = require("../utils");
const CREATE_NEW_FIREBASE_WEB_APP = "CREATE_NEW_WEB_APP";
const CONTINUE_WITHOUT_SELECTING_FIREBASE_WEB_APP = "CONTINUE_WITHOUT_SELECTING_FIREBASE_WEB_APP";
exports.webApps = {
    CREATE_NEW_FIREBASE_WEB_APP,
    CONTINUE_WITHOUT_SELECTING_FIREBASE_WEB_APP,
    getOrCreateWebApp,
    generateWebAppName,
};
/**
 * If firebaseWebAppId is provided and a matching web app exists, it is
 * returned. If firebaseWebAppId is not provided, a new web app with the given
 * backendId is created.
 * @param projectId user's projectId
 * @param firebaseWebAppId (optional) id of an existing Firebase web app
 * @param backendId name of the app hosting backend
 * @return app name and app id
 */
async function getOrCreateWebApp(projectId, firebaseWebAppId, backendId) {
    const webAppsInProject = await (0, apps_1.listFirebaseApps)(projectId, apps_1.AppPlatform.WEB);
    if (firebaseWebAppId) {
        const webApp = webAppsInProject.find((app) => app.appId === firebaseWebAppId);
        if (webApp === undefined) {
            throw new error_1.FirebaseError(`The web app '${firebaseWebAppId}' does not exist in project ${projectId}`);
        }
        return {
            name: webApp.displayName ?? webApp.appId,
            id: webApp.appId,
        };
    }
    const webAppName = await generateWebAppName(projectId, backendId);
    try {
        const app = await (0, apps_1.createWebApp)(projectId, { displayName: webAppName });
        (0, utils_1.logSuccess)(`Created a new Firebase web app named "${webAppName}"`);
        return { name: app.displayName, id: app.appId };
    }
    catch (e) {
        if (isQuotaError(e)) {
            (0, utils_1.logWarning)("Unable to create a new web app, the project has reached the quota for Firebase apps. Navigate to your Firebase console to manage or delete a Firebase app to continue. ");
            return;
        }
        throw new error_1.FirebaseError("Unable to create a Firebase web app", {
            original: e instanceof Error ? e : undefined,
        });
    }
}
async function generateWebAppName(projectId, backendId) {
    const webAppsInProject = await (0, apps_1.listFirebaseApps)(projectId, apps_1.AppPlatform.WEB);
    const appsMap = firebaseAppsToMap(webAppsInProject);
    if (!appsMap.get(backendId)) {
        return backendId;
    }
    let uniqueId = 1;
    let webAppName = `${backendId}_${uniqueId}`;
    while (appsMap.get(webAppName)) {
        uniqueId += 1;
        webAppName = `${backendId}_${uniqueId}`;
    }
    return webAppName;
}
function firebaseAppsToMap(apps) {
    return new Map(apps.map((obj) => [
        // displayName can be null, use app id instead if so. Example - displayName: "mathusan-web-app", appId: "1:461896338144:web:426291191cccce65fede85"
        obj.displayName ?? obj.appId,
        obj.appId,
    ]));
}
/**
 * TODO: Make this generic to be re-used in other parts of the CLI
 */
function isQuotaError(error) {
    const original = error.original;
    const code = original?.status ||
        original?.context?.response?.statusCode ||
        original?.context?.body?.error?.code;
    return code === 429;
}
//# sourceMappingURL=app.js.map