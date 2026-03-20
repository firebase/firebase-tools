import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { appendFileSync } from "fs";
import { appendFile } from "fs/promises";

export class LoggingStdioServerTransport extends StdioServerTransport {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
    appendFileSync(path, "--- new process start ---\n");
    const origOnData = this._ondata;
    this._ondata = (chunk: Buffer) => {
      origOnData(chunk);
      appendFileSync(path, chunk.toString(), { encoding: "utf8" });
    };
  }

  async send(message: JSONRPCMessage) {
    await super.send(message);
    await appendFile(this.path, JSON.stringify(message) + "\n");
  }
}
