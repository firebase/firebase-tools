"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAliases = exports.needProjectNumber = exports.needProjectId = exports.getProjectId = void 0;
const projects_1 = require("./management/projects");
const clc = __importStar(require("colorette"));
const marked_1 = require("marked");
const { FirebaseError } = require("./error");
/**
 * Retrieves the projectId from a command's options context.
 *
 * @param options The options context for a command.
 * @returns The projectId
 */
function getProjectId({ projectId, project, }) {
    return projectId || project;
}
exports.getProjectId = getProjectId;
/**
 * Tries to determine the correct projectId given current
 * command context. Errors out if unable to determine.
 * @returns The projectId
 */
function needProjectId({ projectId, project, rc, }) {
    if (projectId || project) {
        return projectId || project;
    }
    const aliases = rc?.projects || {};
    const aliasCount = Object.keys(aliases).length;
    if (aliasCount === 0) {
        throw new FirebaseError("No currently active project.\n" +
            "To run this command, you need to specify a project. You have two options:\n" +
            "- Run this command with " +
            clc.bold("--project <alias_or_project_id>") +
            ".\n" +
            "- Set an active project by running " +
            clc.bold("firebase use --add") +
            ", then rerun this command.\n" +
            "To list all the Firebase projects to which you have access, run " +
            clc.bold("firebase projects:list") +
            ".\n" +
            (0, marked_1.marked)("To learn about active projects for the CLI, visit https://firebase.google.com/docs/cli#project_aliases"));
    }
    const aliasList = Object.entries(aliases)
        .map(([aname, projectId]) => `  ${aname} (${projectId})`)
        .join("\n");
    throw new FirebaseError("No project active, but project aliases are available.\n\nRun " +
        clc.bold("firebase use <alias>") +
        " with one of these options:\n\n" +
        aliasList);
}
exports.needProjectId = needProjectId;
/**
 * Fetches the project number, throwing an error if unable to resolve the
 * project identifiers in the context to a number.
 *
 * @param options CLI options.
 * @return the project number, as a string.
 */
async function needProjectNumber(options) {
    if (options.projectNumber) {
        return options.projectNumber;
    }
    const projectId = needProjectId(options);
    const metadata = await (0, projects_1.getProject)(projectId);
    options.projectNumber = metadata.projectNumber;
    return options.projectNumber;
}
exports.needProjectNumber = needProjectNumber;
/**
 * Looks up all aliases for projectId.
 * @param options CLI options.
 * @param projectId A project id to get the aliases for
 */
function getAliases(options, projectId) {
    if (options.rc.hasProjects) {
        return Object.entries(options.rc.projects)
            .filter((entry) => entry[1] === projectId)
            .map((entry) => entry[0]);
    }
    return [];
}
exports.getAliases = getAliases;
//# sourceMappingURL=projectUtils.js.map