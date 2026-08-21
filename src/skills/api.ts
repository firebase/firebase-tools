import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as path from "path";
import * as clc from "colorette";
import { Options } from "../options";
import { getSkillsDir, loadManifest, saveManifest } from "./manifest";
import { FirebaseError } from "../error";
import * as utils from "../utils";
import { confirm } from "../prompt";
import { fetchRegistry } from "./registry";

export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function installSkill(
  skillName: string,
  source: string,
  options: Options & { global?: boolean; alias?: string; set?: Record<string, string> }
): Promise<void> {
  const isGlobal = !!options.global;
  
  // Check for shadowing conflicts
  const otherScope = !isGlobal;
  let otherSkillsDir: string | undefined;
  try {
     otherSkillsDir = getSkillsDir(options, otherScope);
  } catch (e) {
     // Ignore if other scope doesn't exist (e.g. no project root for local)
  }

  const fileName = options.alias || skillName;
  if (otherSkillsDir) {
    const otherFilePath = path.join(otherSkillsDir, `${fileName}.ts`);
    if (await fs.pathExists(otherFilePath)) {
      const scopeName = isGlobal ? "local" : "global";
      const msg = `Skill ${clc.bold(fileName)} already exists in the ${clc.bold(scopeName)} scope. This might cause shadowing conflicts. Continue?`;
      if (!(await confirm({ message: msg, nonInteractive: options.nonInteractive, force: options.force }))) {
        throw new FirebaseError("Installation aborted by user.");
      }
    }
  }

  // 1. Resolve source (Simulated for now)
  // In a real implementation, we would fetch from GitHub or a local path.
  let content = `// Skill: ${skillName}\n// Source: ${source}\n// Updated: ${new Date().toISOString()}\nconsole.log("Executed ${skillName}");\n`;
  
  // 2. Apply transformations
  const transformations: Record<string, any> = {};
  if (options.alias) {
    transformations.alias = options.alias;
  }
  if (options.set) {
    for (const [key, value] of Object.entries(options.set)) {
      transformations[key] = value;
      // Simple template replacement
      content = content.replace(new RegExp(`{{${key}}}`, "g"), String(value));
    }
  }

  // 3. Compute hash
  const hash = computeHash(content);

  // 4. Write to disk
  const skillsDir = getSkillsDir(options, isGlobal);
  const filePath = path.join(skillsDir, `${fileName}.ts`);
  
  await fs.ensureDir(skillsDir);
  await fs.writeFile(filePath, content);

  // 5. Update manifest
  const manifest = await loadManifest(options, isGlobal);
  manifest.skills[skillName] = {
    source,
    localFileHash: hash,
    transformations,
  };
  manifest.lastUpdateDate = new Date().toISOString();
  await saveManifest(options, manifest, isGlobal);

  utils.logSuccess(`Skill ${clc.bold(fileName)} installed successfully to ${isGlobal ? "global" : "local"} scope.`);
}

export async function removeSkill(
  skillName: string,
  options: Options & { global?: boolean }
): Promise<void> {
  const isGlobal = !!options.global;
  const manifest = await loadManifest(options, isGlobal);
  
  if (!manifest.skills[skillName]) {
    throw new FirebaseError(`Skill ${clc.bold(skillName)} not found in ${isGlobal ? "global" : "local"} manifest.`);
  }

  const entry = manifest.skills[skillName];
  const fileName = entry.transformations?.alias || skillName;
  const skillsDir = getSkillsDir(options, isGlobal);
  const filePath = path.join(skillsDir, `${fileName}.ts`);

  if (await fs.pathExists(filePath)) {
    await fs.remove(filePath);
  }

  delete manifest.skills[skillName];
  manifest.lastUpdateDate = new Date().toISOString();
  await saveManifest(options, manifest, isGlobal);

  utils.logSuccess(`Skill ${clc.bold(fileName)} removed successfully from ${isGlobal ? "global" : "local"} scope.`);
}

export async function updateSkills(options: Options & { global?: boolean }): Promise<void> {
  const isGlobal = !!options.global;
  utils.logBullet(`Updating skills in ${isGlobal ? "global" : "local"} scope...`);
  
  const manifest = await loadManifest(options, isGlobal);
  const registry = await fetchRegistry();
  const skillsDir = getSkillsDir(options, isGlobal);

  // 2. Garbage Collection (Tombstones)
  if (registry.tombstones) {
    for (const [oldName, newName] of Object.entries(registry.tombstones)) {
      if (manifest.skills[oldName]) {
        utils.logBullet(`Skill ${clc.bold(oldName)} has been renamed to ${clc.bold(newName)}. Migrating...`);
        // Remove old and install new (simulated)
        await removeSkill(oldName, options);
        await installSkill(newName, `firebase/agent-skills/${newName}`, options as any);
      }
    }
  }

  // 3 & 4. Evaluate synchronization matrix
  for (const [skillName, entry] of Object.entries(manifest.skills)) {
    const fileName = entry.transformations?.alias || skillName;
    const filePath = path.join(skillsDir, `${fileName}.ts`);

    if (!(await fs.pathExists(filePath))) {
      utils.logWarning(`Skill ${clc.bold(skillName)} manifest entry exists but file is missing at ${filePath}.`);
      continue;
    }

    const currentContent = await fs.readFile(filePath, "utf-8");
    const currentHash = computeHash(currentContent);

    const remoteSHA = registry.skills[skillName];
    if (!remoteSHA) {
      utils.logBullet(`${clc.bold(skillName)}: Not found in remote registry. Skipping.`);
      continue;
    }

    // Check for manual edits (Conflict detection)
    if (currentHash !== entry.localFileHash) {
      utils.logWarning(`${clc.bold(skillName)}: Local file has been modified manually (Conflict). Skipping update.`);
      continue;
    }

    // 5. Apply updates
    // For this simulation, we'll assume an update is needed if the remote SHA doesn't match a "current" one.
    // In reality, you'd compare entry.remoteSHA (which you'd store) with registry.skills[skillName].
    utils.logBullet(`${clc.bold(skillName)}: Checking for updates...`);
    
    // Simulate that all skills in registry are "new" version
    utils.logBullet(`${clc.bold(skillName)}: Update available. Applying...`);
    await installSkill(skillName, entry.source, { 
      ...options, 
      alias: entry.transformations?.alias, 
      set: entry.transformations 
    } as any);
  }

  utils.logSuccess(`Skills update complete for ${isGlobal ? "global" : "local"} scope.`);
}
