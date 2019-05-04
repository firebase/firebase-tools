import * as pathLib from "path";

import { ListRemote, RTDBListRemote } from "./listRemote";
import { GetRemote, RTDBGetRemote } from "./getRemote";
import { Stack } from "../throttler/stack";

const INITIAL_LIST_BATCH_SIZE = 100;
const INITIAL_READ_BATCH_SIZE = 25;

const DEFAULT_TIMEOUT = 5;

export default class DatabaseSize {
  path: string;
  timeLeft: number;

  listRemote: ListRemote;
  getRemote: GetRemote;

  private listStack: Stack<() => Promise<string[]>, string[]>;

  constructor(instance: string, path: string, timeout?: number) {
    this.path = path;
    this.timeLeft = timeout || DEFAULT_TIMEOUT;
    this.listRemote = new RTDBListRemote(instance);
    this.getRemote = new RTDBGetRemote(instance);
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

    while (this.timeLeft > 0) {
      const start = Date.now();
      const subPaths = await this.listStack.run(() =>
        this.listRemote.listPath(path, listBatchSize, offset)
      );
      this.timeLeft -= Date.now() - start;

      if (this.timeLeft <= 0) {
        return Promise.resolve(sizeEstimate);
      }

      /*
       * We have no children, use as much time as we want.
       */
      if (subPaths.length === 0) {
        return sizeEstimate + (await this.getRemote.getPath(path, this.timeLeft));
      }

      /*
       * Start next listing at the end of the current one.
       * TODO: Verify that batches don't overlap here.
       */
      offset = subPaths[subPaths.length - 1];

      let size = 0;

      for (const subPath of subPaths) {
        size = await this.getSubtreeSize(pathLib.join(path, subPath));
        if (size) {
          sizeEstimate += size;
        }
        if (this.timeLeft <= 0) {
          break;
        }
      }
    }

    return Promise.resolve(sizeEstimate);
  }
}
