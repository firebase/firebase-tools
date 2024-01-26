import * as _ from "lodash";
import * as clc from "colorette";
import * as cjson from "cjson";
import * as fs from "fs";
import * as path from "path";

import { detectProjectRoot } from "./detectProjectRoot";
import { FirebaseError } from "./error";
import * as fsutils from "./fsutils";
import * as utils from "./utils";

// "exclusive" target implies that a resource can only be assigned a single target name
const TARGET_TYPES: { [type: string]: { resource: string; exclusive: boolean } } = {
  storage: { resource: "bucket", exclusive: true },
  database: { resource: "instance", exclusive: true },
  hosting: { resource: "site", exclusive: true },
};

export function loadRC(options: { cwd?: string; [other: string]: any }) {
  const cwd = options.cwd || process.cwd();
  const dir = detectProjectRoot(options);
  const potential = path.resolve(dir || cwd, "./.firebaserc");
  return RC.loadFile(potential);
}

type EtagResourceType = "extensionInstances";

export interface RCData {
  projects: { [alias: string]: string };
  targets: {
    [projectId: string]: {
      [targetType: string]: {
        [targetName: string]: string[];
      };
    };
  };
  etags: {
    [projectId: string]: Record<EtagResourceType, Record<string, string>>;
  };
}

export class RC {
  path: string | undefined;
  data: RCData;

  static loadFile(rcpath: string): RC {
    let data = {};
    if (fsutils.fileExistsSync(rcpath)) {
      try {
        data = cjson.load(rcpath);
      } catch (e: any) {
        // malformed rc file is a warning, not an error
        utils.logWarning("JSON error trying to load " + clc.bold(rcpath));
      }
    }
    return new RC(rcpath, data);
  }

  constructor(rcpath?: string, data?: Partial<RCData>) {
    this.path = rcpath;
    this.data = { projects: {}, targets: {}, etags: {}, ...data };
  }

  private set(key: string | string[], value: any): void {
    _.set(this.data, key, value);
    return;
  }

  private unset(key: string | string[]): boolean {
    return _.unset(this.data, key);
  }

  /**
   * If the given string is a project alias, resolve it to the
   * project id.
   * @param alias The alias to resolve.
   * @returns The resolved project id or the input string if none found.
   */
  resolveAlias(alias: string): string {
    return this.data.projects[alias] || alias;
  }

  hasProjectAlias(alias: string): boolean {
    return !!this.data.projects[alias];
  }

  addProjectAlias(alias: string, project: string): boolean {
    this.set(["projects", alias], project);
    return this.save();
  }

  removeProjectAlias(alias: string): boolean {
    this.unset(["projects", alias]);
    return this.save();
  }

  get hasProjects(): boolean {
    return Object.keys(this.data.projects).length > 0;
  }

  get projects(): { [projectId: string]: string } {
    return this.data.projects;
  }

  allTargets(project: string): { [type: string]: { [targetName: string]: string[] } } {
    return this.data.targets[project] || {};
  }

  targets(project: string, type: string): { [targetName: string]: string[] } {
    return this.data.targets[project]?.[type] || {};
  }

  target(project: string, type: string, name: string): string[] {
    return this.data.targets[project]?.[type]?.[name] || [];
  }

  applyTarget(project: string, type: string, targetName: string, resources: string | string[]) {
    if (!TARGET_TYPES[type]) {
      throw new FirebaseError(
        `Unrecognized target type ${clc.bold(type)}. Must be one of ${Object.keys(
          TARGET_TYPES,
        ).join(", ")}`,
      );
    }

    if (typeof resources === "string") {
      resources = [resources];
    }

    const changed: { resource: string; target: string }[] = [];

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

  removeTarget(project: string, type: string, resource: string): string | null {
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
  clearTarget(project: string, type: string, name: string): boolean {
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
  findTarget(project: string, type: string, resource: string): string | null {
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
  unsetTargetResource(project: string, type: string, name: string, resource: string): void {
    const updatedResources = this.target(project, type, name).filter((r) => r !== resource);

    if (updatedResources.length) {
      this.set(["targets", project, type, name], updatedResources);
    } else {
      this.unset(["targets", project, type, name]);
    }
  }

  /**
   * Throws an error if the specified target is not configured for
   * the specified project.
   */
  requireTarget(project: string, type: string, name: string): string[] {
    const target = this.target(project, type, name);
    if (!target.length) {
      throw new FirebaseError(
        `Deploy target ${clc.bold(name)} not configured for project ${clc.bold(
          project,
        )}. Configure with:

  firebase target:apply ${type} ${name} <resources...>`,
      );
    }

    return target;
  }

  getEtags(projectId: string): Record<EtagResourceType, Record<string, string>> {
    return this.data.etags[projectId] || { extensionInstances: {} };
  }

  setEtags(projectId: string, resourceType: EtagResourceType, etagData: Record<string, string>) {
    if (!this.data.etags[projectId]) {
      this.data.etags[projectId] = {} as Record<EtagResourceType, Record<string, string>>;
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
