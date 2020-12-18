import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators, EmulatorInstance, EmulatorInfo } from "../types";
import { createApp } from "./server";
import { FirebaseError } from "../../error";

export interface AuthEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
}

export class AuthEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  constructor(private args: AuthEmulatorArgs) {}

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    const app = await createApp(this.args.projectId);
    const server = app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  async connect(): Promise<void> {
    // No-op
  }

  stop(): Promise<void> {
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.AUTH);
    const port = this.args.port || Constants.getDefaultPort(Emulators.AUTH);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.AUTH;
  }

  async importData(authExportDir: string, projectId: string): Promise<void> {
    const logger = EmulatorLogger.forEmulator(Emulators.DATABASE);
    const { host, port } = this.getInfo();

    // TODO: In the future when we support import on demand, clear data first.

    const configPath = path.join(authExportDir, "config.json");
    const configStat = await stat(configPath);
    if (configStat?.isFile()) {
      logger.logLabeled("BULLET", "auth", `Importing config from ${configPath}`);

      await importFromFile(
        {
          method: "PATCH",
          host,
          port,
          path: `/emulator/v1/projects/${projectId}/config`,
          headers: {
            Authorization: "Bearer owner",
            "Content-Type": "application/json",
          },
        },
        configPath
      );
    }

    const accountsPath = path.join(authExportDir, "accounts.json");
    const accountsStat = await stat(accountsPath);
    if (accountsStat?.isFile()) {
      logger.logLabeled("BULLET", "auth", `Importing accounts from ${accountsPath}`);

      await importFromFile(
        {
          method: "POST",
          host,
          port,
          path: `/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchCreate`,
          headers: {
            Authorization: "Bearer owner",
            "Content-Type": "application/json",
          },
        },
        accountsPath,
        // Ignore the error when there are no users. No action needed.
        { ignoreErrors: ["MISSING_USER_ACCOUNT"] }
      );
    }
  }
}

function stat(path: fs.PathLike): Promise<fs.Stats | undefined> {
  return new Promise((resolve, reject) =>
    fs.stat(path, (err, stats) => {
      if (err) {
        if (err.code === "ENOENT") {
          return resolve(undefined);
        }
        return reject(err);
      } else {
        return resolve(stats);
      }
    })
  );
}

function importFromFile(
  reqOptions: http.RequestOptions,
  path: fs.PathLike,
  options: { ignoreErrors?: string[] } = {}
): Promise<void> {
  const readStream = fs.createReadStream(path);

  return new Promise<void>((resolve, reject) => {
    const req = http.request(reqOptions, (response) => {
      if (response.statusCode === 200) {
        resolve();
      } else {
        let data = "";
        response
          .on("data", (d) => {
            data += d.toString();
          })
          .on("error", reject)
          .on("end", () => {
            const ignoreErrors = options?.ignoreErrors;
            if (ignoreErrors?.length) {
              let message;
              try {
                message = JSON.parse(data).error.message;
              } catch {
                message = undefined;
              }
              if (message && ignoreErrors.includes(message)) {
                return resolve();
              }
            }
            return reject(
              new FirebaseError(`Received HTTP status code: ${response.statusCode}\n${data}`)
            );
          });
      }
    });

    req.on("error", reject);
    readStream.pipe(req, { end: true });
  }).catch((e) => {
    throw new FirebaseError(`Error during Auth Emulator import: ${e.message}`, {
      original: e,
      exit: 1,
    });
  });
}
