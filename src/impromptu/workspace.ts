import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { FileSnapshot } from "./types";

/**
 * Manages workspace setup, teardown, and snapshots for Impromptu cases
 */
export class WorkspaceManager {
  constructor(private baseDir: string) {}

  /**
   * Setup a workspace for a specific case
   */
  async setupWorkspace(promptId: string, caseId: string): Promise<string> {
    const workspaceDir = path.join(this.baseDir, `${promptId}-${caseId}-${Date.now()}`);
    
    try {
      await fs.ensureDir(workspaceDir);
      logger.debug(`Created workspace: ${workspaceDir}`);
      return workspaceDir;
    } catch (error) {
      throw new FirebaseError(`Failed to create workspace: ${error}`);
    }
  }

  /**
   * Copy seed files to workspace
   */
  async copySeedFiles(workspaceDir: string, seedFiles: Record<string, string>): Promise<void> {
    for (const [filePath, content] of Object.entries(seedFiles)) {
      const fullPath = path.join(workspaceDir, filePath);
      const dir = path.dirname(fullPath);
      
      try {
        await fs.ensureDir(dir);
        await fs.writeFile(fullPath, content, "utf-8");
        logger.debug(`Copied seed file: ${filePath}`);
      } catch (error) {
        throw new FirebaseError(`Failed to copy seed file ${filePath}: ${error}`);
      }
    }
  }

  /**
   * Copy seed directory to workspace
   */
  async copySeedDirectory(workspaceDir: string, seedDir: string): Promise<void> {
    try {
      const files = await this.walkDirectory(seedDir);
      
      for (const file of files) {
        const relativePath = path.relative(seedDir, file);
        const sourcePath = file;
        const destPath = path.join(workspaceDir, relativePath);
        const destDir = path.dirname(destPath);
        
        await fs.ensureDir(destDir);
        await fs.copy(sourcePath, destPath);
      }
      
      logger.debug(`Copied ${files.length} files from seed directory`);
    } catch (error) {
      throw new FirebaseError(`Failed to copy seed directory: ${error}`);
    }
  }

  /**
   * Create a snapshot of the workspace
   */
  async createSnapshot(workspaceDir: string): Promise<FileSnapshot> {
    const files: Record<string, string> = {};
    const allFiles = await this.walkDirectory(workspaceDir);
    
    // Calculate SHA256 for each file
    for (const filePath of allFiles) {
      const relativePath = path.relative(workspaceDir, filePath);
      const content = await fs.readFile(filePath);
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      files[relativePath] = hash;
    }
    
    // Calculate tree hash (hash of all file hashes)
    const sortedPaths = Object.keys(files).sort();
    const treeContent = sortedPaths.map(p => `${p}:${files[p]}`).join("\n");
    const treeHash = crypto.createHash("sha256").update(treeContent).digest("hex");
    
    return {
      files,
      tree: treeHash,
    };
  }

  /**
   * Compare two snapshots and return differences
   */
  compareSnapshots(before: FileSnapshot, after: FileSnapshot): SnapshotDiff {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    
    // Check for added and modified files
    for (const [path, hash] of Object.entries(after.files)) {
      if (!before.files[path]) {
        added.push(path);
      } else if (before.files[path] !== hash) {
        modified.push(path);
      }
    }
    
    // Check for deleted files
    for (const path of Object.keys(before.files)) {
      if (!after.files[path]) {
        deleted.push(path);
      }
    }
    
    return {
      added,
      modified,
      deleted,
      identical: before.tree === after.tree,
    };
  }

  /**
   * Clean up a workspace
   */
  async cleanupWorkspace(workspaceDir: string): Promise<void> {
    try {
      await fs.remove(workspaceDir);
      logger.debug(`Cleaned up workspace: ${workspaceDir}`);
    } catch (error) {
      logger.warn(`Failed to cleanup workspace ${workspaceDir}: ${error}`);
    }
  }

  /**
   * Clean up all workspaces older than a certain age
   */
  async cleanupOldWorkspaces(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const now = Date.now();
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const workspaceDir = path.join(this.baseDir, entry.name);
          const stats = await fs.stat(workspaceDir);
          
          if (now - stats.mtimeMs > maxAgeMs) {
            await this.cleanupWorkspace(workspaceDir);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup old workspaces: ${error}`);
    }
  }

  /**
   * Walk directory recursively and return all file paths
   */
  private async walkDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    async function walk(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip common directories that shouldn't be included
          if (!["node_modules", ".git", ".impromptu"].includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }
    
    await walk(dir);
    return files.sort();
  }
}

interface SnapshotDiff {
  added: string[];
  modified: string[];
  deleted: string[];
  identical: boolean;
}