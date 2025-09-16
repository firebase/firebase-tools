"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultDatabaseInstance = void 0;
const projects_1 = require("./management/projects");
/**
 * Tries to determine the default database instance for a project.
 * @param options The command-line options object
 * @return The instance ID, empty if it doesn't exist.
 */
async function getDefaultDatabaseInstance(options) {
    const projectDetails = await (0, projects_1.getFirebaseProject)(options.project);
    return projectDetails.resources?.realtimeDatabaseInstance || "";
}
exports.getDefaultDatabaseInstance = getDefaultDatabaseInstance;
//# sourceMappingURL=getDefaultDatabaseInstance.js.map