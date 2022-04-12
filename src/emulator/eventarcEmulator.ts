import * as _ from "lodash";
import * as express from "express";
import * as cors from "cors";
import { logger } from "../logger";
import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { createDestroyer } from "../utils";
import { EmulatorLogger } from "./emulatorLogger";

interface RequestWithRawBody extends express.Request {
  rawBody: Buffer;
}

export interface EventarcEmulatorArgs {
  port?: number;
  host?: string;
}

export class EventarcEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  private logger = EmulatorLogger.forEmulator(Emulators.EVENTARC);

  constructor(private args: EventarcEmulatorArgs) {}

  createHubServer(): express.Application {
    const hub = express();

    // @TODO(huangjeff): What exactly is this doing? Copied and pasted from functions emulator.
    const dataMiddleware: express.RequestHandler = (req, res, next) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        (req as RequestWithRawBody).rawBody = Buffer.concat(chunks);
        next();
      });
    };

    const helloWorldRoute = `/hello_world`;

    /*
    // A trigger named "foo" needs to respond at "foo" as well as "foo/*" but not "fooBar".
    const httpsFunctionRoutes = [httpsFunctionRoute, `${httpsFunctionRoute}/*`];
    */

    const helloWorldHandler: express.RequestHandler = (req, res) => {
      console.log("hello world");
    };
    hub.all([helloWorldRoute], dataMiddleware, helloWorldHandler);
    hub.all("*", dataMiddleware, (req, res) => {
      logger.debug(`Eventarc emulator received unknown request at path ${req.path}`);
      res.sendStatus(404);
    });
    return hub;
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    const server = this.createHubServer().listen(port, host);
    this.destroyServer = createDestroyer(server);
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    // wip. what to do here?
  }

  async stop(): Promise<void> {
    if (this.destroyServer) {
      await this.destroyServer();
    }
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.EVENTARC);
    const port = this.args.port || Constants.getDefaultPort(Emulators.EVENTARC);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.EVENTARC;
  }
}
