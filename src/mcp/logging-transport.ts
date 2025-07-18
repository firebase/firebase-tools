import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { appendFileSync } from "fs";

export class LoggingStdioServerTransport extends StdioServerTransport {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
    const origOnData = this._ondata;
    this._ondata = (chunk: Buffer) => {
      origOnData(chunk);
      appendFileSync(path, chunk.toString(), { encoding: "utf8" });
    };
  }

  async send(message: JSONRPCMessage) {
    await super.send(message);
    appendFileSync(this.path, JSON.stringify(message) + "\n");
  }
}
