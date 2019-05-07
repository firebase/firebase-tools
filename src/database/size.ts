import * as pathLib from "path";

import { ListRemote, RTDBListRemote } from "./listRemote";
import { RTDBSizeRemote, SizeRemote } from "./sizeRemote";
import { Stack } from "../throttler/stack";

const INITIAL_LIST_BATCH_SIZE = 100;

const DEFAULT_TIMEOUT = 1000;

export default class DatabaseSize {
  path: string;
  timeLeft: number;

  listRemote: ListRemote;
  sizeRemote: SizeRemote;

  private listStack: Stack<() => Promise<string[]>, string[]>;

  constructor(instance: string, path: string, timeout?: number) {
    this.path = path;
    this.timeLeft = timeout || DEFAULT_TIMEOUT;
    this.sizeRemote = new RTDBSizeRemote(instance);
    this.listRemote = new RTDBListRemote(instance);
    this.listStack = new Stack({
      name: "list stack",
      concurrency: 1,
      retries: 3,
    });
  }

  async execute(): Promise<number> {
    return this.getSubtreeSize(this.path);
  }

  private async getSubtreeSize(path: string): Promise<number> {
    let sizeEstimate = 0;
    let offset: string;

    const listBatchSize = INITIAL_LIST_BATCH_SIZE;
    const timeout = DEFAULT_TIMEOUT;

    try {
      sizeEstimate = await this.sizeRemote.sizeNode(path, timeout);
    } catch (e) {
      let subPaths = [];

      sizeEstimate += 2;
      do {
        subPaths = await this.listStack.run(() =>
          this.listRemote.listPath(path, listBatchSize, offset)
        );
        offset = subPaths[subPaths.length - 1];
        for (const subPath of subPaths) {
          sizeEstimate +=
            Buffer.byteLength(subPath) + (await this.getSubtreeSize(pathLib.join(path, subPath)));
        }
      } while (subPaths.length > 0);
    }
    return Promise.resolve(sizeEstimate);
  }
}
