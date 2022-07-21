import { openSync, closeSync, readSync, unlinkSync, renameSync, mkdirSync } from "fs";
import * as rimraf from "rimraf";
import * as fs from "fs";
import * as path from "path";
import * as uuid from "uuid";

/**
 * Helper for disk I/O operations.
 * Assigns a unique identifier to each file and stores it on disk based on that identifier
 */
export class Persistence {
  private _dirPath!: string;
  // Mapping from emulator filePaths to unique identifiers on disk
  private _diskPathMap: Map<string, string>;
  constructor(dirPath: string) {
    this.reset(dirPath);
    this._diskPathMap = new Map();
  }

  public reset(dirPath: string) {
    this._dirPath = dirPath;
    mkdirSync(dirPath, {
      recursive: true,
    });
  }

  public get dirPath(): string {
    return this._dirPath;
  }

  appendBytes(fileName: string, bytes: Buffer): string {
    this._diskPathMap.set(fileName, uuid.v4());
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
          resolve();
        }
      });
    });
  }

  renameFile(oldName: string, newName: string): void {
    this._diskPathMap.set(newName, uuid.v4());
    renameSync(this.getDiskPath(oldName), this.getDiskPath(newName));
  }

  getDiskPath(fileName: string): string {
    const shortenedDiskPath = this._diskPathMap.get(fileName);
    if (shortenedDiskPath !== undefined) {
      return path.join(this._dirPath, encodeURIComponent(shortenedDiskPath));
    }
    return path.join(this._dirPath, encodeURIComponent(fileName));
  }

  addDiskPathMapping(fileName: string, diskPath: string): void {
    this._diskPathMap.set(fileName, diskPath);
  }
}