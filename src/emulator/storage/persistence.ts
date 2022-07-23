import { openSync, closeSync, readSync, unlinkSync, mkdirSync } from "fs";
import * as rimraf from "rimraf";
import * as fs from "fs";
import * as fse from "fs-extra";
import * as path from "path";
import * as uuid from "uuid";

/**
 * Helper for disk I/O operations.
 * Assigns a unique identifier to each file and stores it on disk based on that identifier
 */
export class Persistence {
  private _dirPath!: string;
  // Mapping from emulator filePaths to unique identifiers on disk
  private _diskPathMap: Map<string, string> = new Map();
  constructor(dirPath: string) {
    this.reset(dirPath);
  }

  public reset(dirPath: string) {
    this._dirPath = dirPath;
    mkdirSync(dirPath, {
      recursive: true,
    });
    this._diskPathMap = new Map();
  }

  public get dirPath(): string {
    return this._dirPath;
  }

  appendBytes(fileName: string, bytes: Buffer): string {
    if (!this._diskPathMap.has(fileName)) {
      this._diskPathMap.set(fileName, uuid.v4());
    }
    const filepath = this.getDiskPath(fileName);

    let fd;

    try {
      fs.appendFileSync(filepath, bytes);
      return filepath;
    } finally {
      if (fd) {
        closeSync(fd);
      }
    }
  }

  readBytes(fileName: string, size: number, fileOffset?: number): Buffer {
    let fd;
    try {
      fd = openSync(this.getDiskPath(fileName), "r");
      const buf = Buffer.alloc(size);
      const offset = fileOffset && fileOffset > 0 ? fileOffset : 0;
      readSync(fd, buf, 0, size, offset);
      return buf;
    } finally {
      if (fd) {
        closeSync(fd);
      }
    }
  }

  deleteFile(fileName: string, failSilently = false): void {
    try {
      unlinkSync(this.getDiskPath(fileName));
      this._diskPathMap.delete(fileName);
    } catch (err: any) {
      if (!failSilently) {
        throw err;
      }
    }
  }

  deleteAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      rimraf(this._dirPath, (err) => {
        if (err) {
          reject(err);
        } else {
          this._diskPathMap = new Map();
          resolve();
        }
      });
    });
  }

  renameFile(oldName: string, newName: string): void {
    const oldNameId = this._diskPathMap.get(oldName)!;
    this._diskPathMap.set(newName, oldNameId);
  }

  getDiskPath(fileName: string): string {
    const shortenedDiskPath = this._diskPathMap.get(fileName)!;
    return path.join(this._dirPath, encodeURIComponent(shortenedDiskPath));
  }

  copyFromExternalPath(sourcePath: string, newName: string): void {
    this._diskPathMap.set(newName, uuid.v4());
    fse.copyFileSync(sourcePath, this.getDiskPath(newName));
  }
}
