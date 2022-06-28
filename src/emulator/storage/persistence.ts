/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { openSync, closeSync, readSync, unlinkSync, renameSync, mkdirSync } from "fs";
import * as rimraf from "rimraf";
import * as fs from "fs";
import * as path from "path";

/** Helper for disk I/O operations. */
export class Persistence {
  private _dirPath!: string;
  constructor(dirPath: string) {
    this.reset(dirPath);
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
    renameSync(this.getDiskPath(oldName), this.getDiskPath(newName));
  }

  getDiskPath(fileName: string): string {
    return path.join(this._dirPath, encodeURIComponent(fileName));
  }
}
