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

import * as pathLib from "path";
import { expect } from "chai";

import { RemoveRemote } from "../../database/removeRemote";

export class FakeRemoveRemote implements RemoveRemote {
  data: any;
  largeThreshold: number;

  /**
   * @constructor
   * @param data           the fake database structure. Each leaf is an integer representing the subtree's size.
   * @param largeThreshold the threshold to determine if a delete exceeds the writeSizeLimit.
   *                       If the sum of all leaves to delete is larger than largeThreshold,
   *                       the delete will return false.
   */
  constructor(data: any, largeThreshold: number = 10) {
    this.data = data;
    this.largeThreshold = largeThreshold;
  }

  deletePath(path: string): Promise<boolean> {
    const d = this._dataAtpath(path);
    const size = this._size(d);
    if (size > this.largeThreshold) {
      return Promise.resolve(false);
    }
    this._deletePath(path);
    return Promise.resolve(true);
  }

  deleteSubPath(path: string, subPaths: string[]): Promise<boolean> {
    const d = this._dataAtpath(path);
    let size = 0;
    for (const p of subPaths) {
      size += this._size(d[p]);
    }
    if (size > this.largeThreshold) {
      return Promise.resolve(false);
    }
    for (const p of subPaths) {
      this.deletePath(`${path}/${p}`);
    }
    return Promise.resolve(true);
  }

  private _deletePath(path: string): void {
    if (path === "/") {
      this.data = null;
      return;
    }
    const parentDir = pathLib.dirname(path);
    const basename = pathLib.basename(path);
    delete this._dataAtpath(parentDir)[basename];
    if (Object.keys(this._dataAtpath(parentDir)).length === 0) {
      return this._deletePath(parentDir);
    }
  }

  private _size(data: any): number {
    if (typeof data === "number") {
      return data;
    }
    let size = 0;
    for (const key of Object.keys(data)) {
      size += this._size(data[key]);
    }
    return size;
  }

  private _dataAtpath(path: string): any {
    const splitedPath = path.slice(1).split("/");
    let d = this.data;
    for (const p of splitedPath) {
      if (d && p !== "") {
        if (typeof d === "number") {
          d = null;
        } else {
          d = d[p];
        }
      }
    }
    return d;
  }
}

describe("FakeRemoveRemote", () => {
  it("should failed to delete large path /", async () => {
    const data = { 1: 11 };
    const fakeDb = new FakeRemoveRemote(data);
    await expect(fakeDb.deletePath("/")).to.eventually.eql(false);
    expect(fakeDb.data).eql(data);
  });

  it("should sucessfully delete large path /", async () => {
    const fakeDb = new FakeRemoveRemote({ 1: 9 });
    await expect(fakeDb.deletePath("/")).to.eventually.eql(true);
    expect(fakeDb.data).eql(null);
  });

  it("should failed to delete large path /1", async () => {
    const data = { 1: { a: 3, b: 9, c: 2, d: 3 } };
    const fakeDb = new FakeRemoveRemote(data);
    await expect(fakeDb.deletePath("/1")).to.eventually.eql(false);
    expect(fakeDb.data).eql(data);
  });

  it("should successfully delete path /1/a", async () => {
    const fakeDb = new FakeRemoveRemote({ 1: { a: 3, b: 9, c: 2, d: 3 } });
    await expect(fakeDb.deletePath("/1/a")).to.eventually.eql(true);
    expect(fakeDb.data).eql({ 1: { b: 9, c: 2, d: 3 } });
  });

  it("should failed to delete large paths /1/a /1/b", async () => {
    const data = { 1: { a: 3, b: 9, c: 2, d: 3 } };
    const fakeDb = new FakeRemoveRemote(data);
    await expect(fakeDb.deleteSubPath("/1", ["a", "b"])).to.eventually.eql(false);
    expect(fakeDb.data).eql(data);
  });

  it("should successfully delete multi paths /1/c /1/d", async () => {
    const fakeDb = new FakeRemoveRemote({ 1: { a: 3, b: 9, c: 2, d: 3 } });
    await expect(fakeDb.deleteSubPath("/1", ["c", "d"])).to.eventually.eql(true);
    expect(fakeDb.data).eql({ 1: { a: 3, b: 9 } });
  });
});
