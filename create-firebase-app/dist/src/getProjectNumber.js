"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectNumber = void 0;
const projects_1 = require("./management/projects");
const projectUtils_1 = require("./projectUtils");
/**
 * Fetches the project number.
 * @param options CLI options.
 * @return the project number, as a string.
 */
async function getProjectNumber(options) {
    if (options.projectNumber) {
        return options.projectNumber;
    }
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const metadata = await (0, projects_1.getProject)(projectId);
    options.projectNumber = metadata.projectNumber;
    return options.projectNumber;
}
exports.getProjectNumber = getProjectNumber;
