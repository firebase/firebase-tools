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
exports.RC = exports.loadRC = void 0;
const _ = __importStar(require("lodash"));
const clc = __importStar(require("colorette"));
const cjson = __importStar(require("cjson"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const detectProjectRoot_1 = require("./detectProjectRoot");
const error_1 = require("./error");
const fsutils = __importStar(require("./fsutils"));
const utils = __importStar(require("./utils"));
// "exclusive" target implies that a resource can only be assigned a single target name
const TARGET_TYPES = {
    storage: { resource: "bucket", exclusive: true },
    database: { resource: "instance", exclusive: true },
    hosting: { resource: "site", exclusive: true },
};
function loadRC(options) {
    const cwd = options.cwd || process.cwd();
    const dir = (0, detectProjectRoot_1.detectProjectRoot)(options);
    const potential = path.resolve(dir || cwd, "./.firebaserc");
    return RC.loadFile(potential);
}
exports.loadRC = loadRC;
class RC {
    static loadFile(rcpath) {
        let data = {};
        if (fsutils.fileExistsSync(rcpath)) {
            try {
                data = cjson.load(rcpath);
            }
            catch (e) {
                // malformed rc file is a warning, not an error
                utils.logWarning("JSON error trying to load " + clc.bold(rcpath));
            }
        }
        return new RC(rcpath, data);
    }
    constructor(rcpath, data) {
        this.path = rcpath;
        this.data = { projects: {}, targets: {}, etags: {}, ...data };
    }
    set(key, value) {
        _.set(this.data, key, value);
        return;
    }
    unset(key) {
        return _.unset(this.data, key);
    }
    /**
     * If the given string is a project alias, resolve it to the
     * project id.
     * @param alias The alias to resolve.
     * @returns The resolved project id or the input string if none found.
     */
    resolveAlias(alias) {
        return this.data.projects[alias] || alias;
    }
    hasProjectAlias(alias) {
        return !!this.data.projects[alias];
    }
    addProjectAlias(alias, project) {
        this.set(["projects", alias], project);
        return this.save();
    }
    removeProjectAlias(alias) {
        this.unset(["projects", alias]);
        return this.save();
    }
    get hasProjects() {
        return Object.keys(this.data.projects).length > 0;
    }
    get projects() {
        return this.data.projects;
    }
    allTargets(project) {
        return this.data.targets[project] || {};
    }
    targets(project, type) {
        return this.data.targets[project]?.[type] || {};
    }
    target(project, type, name) {
        return this.data.targets[project]?.[type]?.[name] || [];
    }
    applyTarget(project, type, targetName, resources) {
        if (!TARGET_TYPES[type]) {
            throw new error_1.FirebaseError(`Unrecognized target type ${clc.bold(type)}. Must be one of ${Object.keys(TARGET_TYPES).join(", ")}`);
        }
        if (typeof resources === "string") {
            resources = [resources];
        }
        const changed = [];
        // remove resources from existing targets
        for (const resource of resources) {
            const cur = this.findTarget(project, type, resource);
            if (cur && cur !== targetName) {
                this.unsetTargetResource(project, type, cur, resource);
                changed.push({ resource: resource, target: cur });
            }
        }
        // apply resources to new target
        const existing = this.target(project, type, targetName);
        const list = Array.from(new Set(existing.concat(resources))).sort();
        this.set(["targets", project, type, targetName], list);
        this.save();
        return changed;
    }
    removeTarget(project, type, resource) {
        const name = this.findTarget(project, type, resource);
        if (!name) {
            return null;
        }
        this.unsetTargetResource(project, type, name, resource);
        this.save();
        return name;
    }
    /**
     * Clears a specific target.
     * @returns true if the target existed, false if not
     */
    clearTarget(project, type, name) {
        if (!this.target(project, type, name).length) {
            return false;
        }
        this.unset(["targets", project, type, name]);
        this.save();
        return true;
    }
    /**
     * Finds a target name for the specified type and resource.
     * @returns The name of the target (if found) or null (if not).
     */
    findTarget(project, type, resource) {
        const targets = this.targets(project, type);
        for (const targetName in targets) {
            if ((targets[targetName] || []).includes(resource)) {
                return targetName;
            }
        }
        return null;
    }
    /**
     * Removes a specific resource from a specified target. Does
     * not persist the result.
     */
    unsetTargetResource(project, type, name, resource) {
        const updatedResources = this.target(project, type, name).filter((r) => r !== resource);
        if (updatedResources.length) {
            this.set(["targets", project, type, name], updatedResources);
        }
        else {
            this.unset(["targets", project, type, name]);
        }
    }
    /**
     * Throws an error if the specified target is not configured for
     * the specified project.
     */
    requireTarget(project, type, name) {
        const target = this.target(project, type, name);
        if (!target.length) {
            throw new error_1.FirebaseError(`Deploy target ${clc.bold(name)} not configured for project ${clc.bold(project)}. Configure with:

  firebase target:apply ${type} ${name} <resources...>`);
        }
        return target;
    }
    getEtags(projectId) {
        return this.data.etags[projectId] || { extensionInstances: {} };
    }
    setEtags(projectId, resourceType, etagData) {
        if (!this.data.etags[projectId]) {
            this.data.etags[projectId] = {};
        }
        this.data.etags[projectId][resourceType] = etagData;
        this.save();
    }
    /**
     * Persists the RC file to disk, or returns false if no path on the instance.
     */
    save() {
        if (this.path) {
            fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), {
                encoding: "utf8",
            });
            return true;
        }
        return false;
    }
}
exports.RC = RC;
//# sourceMappingURL=rc.js.map