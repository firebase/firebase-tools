import * as vscode from "vscode";
import fetch from "node-fetch";
import { Observable, of } from "rxjs";
import { backOff } from "exponential-backoff";
import { ResolvedDataConnectConfigs } from "./config";
import { Signal } from "@preact/signals-core";

enum Kind {
  KIND_UNSPECIFIED = "KIND_UNSPECIFIED",
  SQL_CONNECTION = "SQL_CONNECTION",
  SQL_MIGRATION = "SQL_MIGRATION",
  VERTEX_AI = "VERTEX_AI",
  FILE_RELOAD = "FILE_RELOAD",
}
enum Severity {
  SEVERITY_UNSPECIFIED = "SEVERITY_UNSPECIFIED",
  DEBUG = "DEBUG",
  NOTICE = "NOTICE",
  ALERT = "ALERT",
}
interface EmulatorIssue {
  kind: Kind;
  severity: Severity;
  message: string;
}

type EmulatorIssueResponse = { result?: { issues?: EmulatorIssue[] } };

export const emulatorOutputChannel =
  vscode.window.createOutputChannel("Firebase Emulators");

/**
 * TODO: convert to class
 * @param fdcEndpoint FDC Emulator endpoint
 */
export async function runEmulatorIssuesStream(
  configs: ResolvedDataConnectConfigs,
  fdcEndpoint: string,
  isPostgresEnabled: Signal<boolean>,
  schemaReloadFunc: () => void,
) {
  const obsErrors = await getEmulatorIssuesStream(configs, fdcEndpoint);
  const obsConverter = {
    next(nextResponse: EmulatorIssueResponse) {
      if (nextResponse.result?.issues?.length) {
        for (const issue of nextResponse.result.issues) {
          displayAndHandleIssue(issue, isPostgresEnabled, schemaReloadFunc);
        }
      }
    },
    error(e: Error) {
      console.log("Stream closed with: ", e);
    },
    complete() {
      console.log("Stream Closed");
    },
  };
  obsErrors.subscribe(obsConverter);
}

/**
 * Based on the severity of the issue, either log, display notification, or display interactive popup to the user
 */
export function displayAndHandleIssue(
  issue: EmulatorIssue,
  isPostgresEnabled: Signal<boolean>,
  schemaReloadFunc: () => void,
) {
  const issueMessage = `Data Connect Emulator: ${issue.kind.toString()} - ${issue.message}`;
  if (issue.severity === Severity.ALERT) {
    vscode.window.showErrorMessage(issueMessage);
  }
  emulatorOutputChannel.appendLine(issueMessage);

  // special handlings
  if (issue.kind === Kind.SQL_CONNECTION) {
    isPostgresEnabled.value = false;
  }
  if (issue.kind === Kind.FILE_RELOAD) {
    schemaReloadFunc();
  }
}

/**
 * Calls the DataConnect.StreamEmulatorIssues api.
 * Converts ReadableStream into Observable
 *
 */
export async function getEmulatorIssuesStream(
  configs: ResolvedDataConnectConfigs,
  dataConnectEndpoint: string,
): Promise<Observable<EmulatorIssueResponse>> {
  try {
    // TODO: eventually support multiple services
    const serviceId = configs.serviceIds[0];

    const resp = await backOff(() =>
      fetch(
        dataConnectEndpoint + `/emulator/stream_issues?serviceId=${serviceId}`,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-mantle-admin": "all",
          },
        },
      ),
    );

    function fromStream(
      stream: NodeJS.ReadableStream,
      finishEventName = "end",
      dataEventName = "data",
    ): Observable<EmulatorIssueResponse> {
      stream.pause();

      return new Observable((observer) => {
        function dataHandler(data: any) {
          observer.next(JSON.parse(data));
        }

        function errorHandler(err: any) {
          observer.error(JSON.parse(err));
        }

        function endHandler() {
          observer.complete();
        }

        stream.addListener(dataEventName, dataHandler);
        stream.addListener("error", errorHandler);
        stream.addListener(finishEventName, endHandler);

        stream.resume();

        return () => {
          stream.removeListener(dataEventName, dataHandler);
          stream.removeListener("error", errorHandler);
          stream.removeListener(finishEventName, endHandler);
        };
      });
    }
    return fromStream(resp.body!);
  } catch (err) {
    console.log("Stream failed to connect with error: ", err);
    return of({});
  }
}
