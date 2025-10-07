import * as clc from "colorette";
import { Command } from "../command";
import { Options } from "../options";
import { getProjectId, needProjectId } from "../projectUtils";
import { pickService, squashGraphQL } from "../dataconnect/load";
import { requireAuth } from "../requireAuth";
import { Constants } from "../emulator/constants";
import { Client } from "../apiv2";
import { DATACONNECT_API_VERSION, executeGraphQL } from "../dataconnect/dataplaneClient";
import { dataconnectDataplaneClient } from "../dataconnect/dataplaneClient";
import { isGraphqlName } from "../dataconnect/names";
import { FirebaseError } from "../error";
import { statSync } from "node:fs";
import {
  ConnectorInfo,
  Impersonation,
  isGraphQLResponse,
  isGraphQLResponseError,
  ServiceInfo,
} from "../dataconnect/types";
import { EmulatorHub } from "../emulator/hub";
import { readFile } from "node:fs/promises";
import { EOL } from "node:os";
import { relative } from "node:path";
import { text } from "node:stream/consumers";
import { logger } from "../logger";
import { responseToError } from "../responseToError";

let stdinUsedFor: string | undefined = undefined;

export const command = new Command("dataconnect:execute [fileOrConnector] [operationName]")
  .description("execute a Data Connect query or mutation")
  .option(
    "--service <serviceId>",
    "The service ID to execute against (optional if there's only one service)",
  )
  .option(
    "--location <locationId>",
    "The location ID to execute against (optional if there's only one service). Ignored by the emulator.",
  )
  .option(
    "-v, --vars <vars>",
    "Supply variables to the operation execution, which must be a JSON object whose keys are variable names. If vars begin with the character @, the rest is interpreted as a file name to read from, or - to read from stdin.",
  )
  .option(
    "-i, --impersonate <claims>",
    'Execute with an impersonated auth context, which may be either the literal string unauthenticated or a JSON object containing Firebase Auth claims, e.g. {"sub": "myUserId"}. If claims begin with the character @, the rest is interpreted as a file name to read from, or - to read from stdin.',
  )
  .option(
    "--no-debug-details",
    "Disables debug information in the response. Executions returns helpful errors or GQL extensions by default, which may expose too much for unprivilleged user or programs. If that's the case, this flag turns those output off.",
  )
  .action(
    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    async (fileOrConnector: string = "", operationName: string | undefined, options: Options) => {
      const emulatorHost = process.env[Constants.FIREBASE_DATACONNECT_EMULATOR_HOST];
      let projectId: string;
      let serviceName: string | undefined = undefined;
      const serviceId = options.service as string | undefined;
      const locationId = options.location as string | undefined;
      if (emulatorHost) {
        projectId = getProjectId(options) || EmulatorHub.MISSING_PROJECT_PLACEHOLDER;
      } else {
        projectId = needProjectId(options);
      }

      if (!fileOrConnector) {
        if (!process.stdin.isTTY) {
          fileOrConnector = "-";
        } else {
          throw new FirebaseError(
            "At least one of the [fileOrConnector] [operationName] arguments is required.",
          );
        }
      }
      async function getServiceInfo(): Promise<ServiceInfo> {
        return pickService(projectId, options.config, serviceId || undefined).catch((e) => {
          if (!(e instanceof FirebaseError)) {
            return Promise.reject(e);
          }
          if (!serviceId) {
            e = new FirebaseError(
              e.message +
                `\nHint: Try specifying the ${clc.yellow("--service <serviceId>")} option.`,
              { ...e, original: e },
            );
          }
          return Promise.reject(e);
        });
      }
      let connector: ConnectorInfo | undefined = undefined;
      if (fileOrConnector !== "-") {
        const stat = statSync(fileOrConnector, { throwIfNoEntry: false });
        if (!stat?.isFile()) {
          if (operationName === undefined /* but not an empty string */) {
            // Command invoked with one single positional argument.
            if (isGraphqlName(fileOrConnector)) {
              operationName = fileOrConnector;
              fileOrConnector = "";
            }
          }
          const serviceInfo = await getServiceInfo();
          serviceName = serviceInfo.serviceName;
          if (fileOrConnector) {
            connector = serviceInfo.connectorInfo.find(
              (c) => c.connector.name === `${serviceName}/connectors/${fileOrConnector}`,
            );
          } else if (serviceInfo.connectorInfo.length === 1) {
            connector = serviceInfo.connectorInfo[0];
          }
          if (!connector) {
            // The first arg is neither a connector or a file, try to throw a good error message.
            if (stat?.isDirectory()) {
              throw new FirebaseError(
                `${fileOrConnector}: is a directory.\nHint: This command can only execute a single GraphQL file or a named operation.\n` +
                  "Hint: To execute a named operation within a local connector, run:\n" +
                  `    firebase dataconnect:execute ${clc.yellow("CONNECTOR_ID OPERATION_NAME")}`,
              );
            } else if (operationName) {
              if (!fileOrConnector) {
                throw new FirebaseError(
                  `Found more than one connector. The connector ID must be specified as the first argument.\n` +
                    "Hint: To execute a named operation within a local connector, run:\n" +
                    `    firebase dataconnect:execute ${clc.yellow("CONNECTOR_ID OPERATION_NAME")}`,
                );
              } else {
                throw new FirebaseError(
                  `${fileOrConnector}: no such file, directory, or connectorId`,
                );
              }
            } else {
              throw new FirebaseError(`${fileOrConnector}: no such file or directory`);
            }
          }
        }
      }

      const opDisplay = operationName ? clc.bold(operationName) : "operation";
      let query: string;
      if (connector) {
        const dir = relative(process.cwd(), connector.directory);
        process.stderr.write(`${clc.cyan(`Executing ${opDisplay} in ${clc.bold(dir)}`)}${EOL}`);
        query = squashGraphQL(connector.connector.source);
        if (!query) {
          throw new FirebaseError(`${dir} contains no GQL files or only empty ones`);
        }
      } else {
        if (fileOrConnector === "-") {
          stdinUsedFor = "operation source code";
          if (process.stdin.isTTY) {
            process.stderr.write(
              `${clc.cyan("Reading GraphQL operation from stdin. EOF (CTRL+D) to finish and execute.")}${EOL}`,
            );
          }
          query = await text(process.stdin);
        } else {
          process.stderr.write(
            `${clc.cyan(`Executing ${opDisplay} in ${clc.bold(fileOrConnector)}`)}${EOL}`,
          );
          query = await readFile(fileOrConnector, "utf-8");
        }
      }

      let apiClient: Client;
      if (emulatorHost) {
        const url = new URL("http://placeholder");
        url.host = emulatorHost;
        apiClient = new Client({
          urlPrefix: url.toString(),
          apiVersion: DATACONNECT_API_VERSION,
        });
      } else {
        await requireAuth(options);
        apiClient = dataconnectDataplaneClient();
      }

      if (!serviceName) {
        if (serviceId && (locationId || emulatorHost)) {
          serviceName = `projects/${projectId}/locations/${locationId || "unused"}/services/${serviceId}`;
        } else {
          serviceName = (await getServiceInfo()).serviceName;
        }
      }
      if (!options.vars && !process.stdin.isTTY && !stdinUsedFor) {
        options.vars = "@-";
      }
      const unparsedVars = await literalOrFile(options.vars, "--vars");
      const unparsedClaims = await literalOrFile(options.impersonate, "--impersonate");
      let impersonate: Impersonation | undefined = undefined;
      if (unparsedClaims === "unauthenticated") {
        impersonate = { unauthenticated: true, includeDebugDetails: !options.noDebugDetails };
      } else if (unparsedClaims) {
        impersonate = {
          authClaims: parseJsonObject(unparsedClaims),
          includeDebugDetails: !options.noDebugDetails,
        };
      }

      const response = await executeGraphQL(apiClient, serviceName, {
        query,
        operationName,
        variables: parseJsonObject(unparsedVars),
        extensions: { impersonate },
      });

      // If the status code isn't OK or the top-level `error` field is set, this
      // is an HTTP / gRPC error, not a GQL-compatible error response.
      let err = responseToError(response, response.body);
      if (isGraphQLResponseError(response.body)) {
        const { status, message } = response.body.error;
        if (!err) {
          err = new FirebaseError(message, {
            context: {
              body: response.body,
              response: response,
            },
            status: response.status,
          });
        }
        if (status === "INVALID_ARGUMENT" && message.includes("operationName is required")) {
          throw new FirebaseError(
            err.message + `\nHint: Append <operationName> as an argument to disambiguate.`,
            { ...err, original: err },
          );
        }
      }
      if (err) {
        throw err;
      }

      // If we reach here, we should have a GraphQL response with `data` and/or
      // `errors` (note the plural). First let's double check that's the case.
      if (!isGraphQLResponse(response.body)) {
        throw new FirebaseError("Got invalid response body with neither .data or .errors", {
          context: {
            body: response.body,
            response: response,
          },
          status: response.status,
        });
      }

      // Log the body to stdout to allow pipe processing (even with .errors).
      logger.info(JSON.stringify(response.body, null, 2));

      // TODO: Pretty-print these errors by parsing the .errors array to extract
      // messages, line numbers, etc.
      if (!response.body.data) {
        // If `data` is absent, this is a request error (i.e. total failure):
        // https://spec.graphql.org/draft/#sec-Errors.Request-Errors
        throw new FirebaseError(
          "GraphQL request error(s). See response body (above) for details.",
          {
            context: {
              body: response.body,
              response: response,
            },
            status: response.status,
          },
        );
      }
      if (response.body.errors && response.body.errors.length > 0) {
        throw new FirebaseError(
          "Execution completed with error(s). See response body (above) for details.",
          {
            context: {
              body: response.body,
              response: response,
            },
            status: response.status,
          },
        );
      }
      return response.body;
    },
  );

function parseJsonObject(json?: string): Record<string, any> {
  try {
    const obj = JSON.parse(json || "{}") as unknown;
    if (typeof obj !== "object" || obj == null) throw new Error("not an object");
    return obj;
  } catch (e) {
    throw new Error("Provided string `" + json + "` is not valid JSON.");
  }
}

async function literalOrFile(arg: any, subject: string): Promise<string> {
  let str = arg as string | undefined;
  if (!str) {
    return "";
  }
  if (str.startsWith("@")) {
    if (str === "@-") {
      if (stdinUsedFor) {
        throw new FirebaseError(
          `standard input can only be used for one of ${stdinUsedFor} and ${subject}.`,
        );
      }
      str = await text(process.stdin);
    } else {
      str = await readFile(str.substring(1), "utf-8");
    }
  }
  return str;
}
