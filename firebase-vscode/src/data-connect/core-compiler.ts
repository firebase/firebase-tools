import * as vscode from "vscode";
import * as path from 'path';
import { Range, DiagnosticSeverity, Diagnostic, Uri, Position } from "vscode";
import fetch from "node-fetch";
import { Observable, of } from "rxjs";
import { backOff } from "exponential-backoff";
import { ResolvedDataConnectConfigs } from "./config";
import { GraphqlError, WarningLevel } from "../../src/dataconnect/types";

type DiagnosticTuple = [Uri, Diagnostic[]];
type CompilerResponse = { result?: { errors?: GraphqlError[] } };

const fdcDiagnosticCollection =
  vscode.languages.createDiagnosticCollection("Dataconnect");
/**
 *
 * @param fdcEndpoint FDC Emulator endpoint
 */
export async function runDataConnectCompiler(
  configs: ResolvedDataConnectConfigs,
  fdcEndpoint: string,
) {
  const obsErrors = await getCompilerStream(configs, fdcEndpoint);
  const obsConverter = {
    next(nextCompilerResponse: CompilerResponse) {
      if (nextCompilerResponse.result && nextCompilerResponse.result.errors) {
        fdcDiagnosticCollection.clear();
        const diagnostics = convertGQLErrorToDiagnostic(
          configs,
          nextCompilerResponse.result.errors,
        );
        fdcDiagnosticCollection.set(diagnostics);
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

function convertGQLErrorToDiagnostic(
  configs: ResolvedDataConnectConfigs,
  gqlErrors: GraphqlError[],
): DiagnosticTuple[] {
  const perFileDiagnostics: Record<string, Diagnostic[]> = {};
  const dcPath = configs.values[0].path;
  for (const error of gqlErrors) {
    const file = error.extensions?.file;
    if (!file) {
      continue;
    }
    const absFilePath = path.join(dcPath, file);
    perFileDiagnostics[absFilePath] = perFileDiagnostics[absFilePath] || [];
    perFileDiagnostics[absFilePath].push({
      source: "Firebase Data Connect: Compiler",
      message: error.message,
      severity: warningLevelToDiagnosticSeverity(error.extensions?.warningLevel),
      range: locationToRange(error.locations?.[0] || { line: 0, column: 0 }),
    });
  }
  return Object.keys(perFileDiagnostics).map((key) => {
    return [
      Uri.file(key),
      perFileDiagnostics[key],
    ] as DiagnosticTuple;
  });
}

function warningLevelToDiagnosticSeverity(level?: WarningLevel): DiagnosticSeverity {
  if (!level) {
    return DiagnosticSeverity.Error;
  }
  switch (level) {
    case "LOG_ONLY":
      return DiagnosticSeverity.Information;
    case "INTERACTIVE_ACK":
    case "REQUIRE_ACK":
      return DiagnosticSeverity.Warning;
    case "REQUIRE_FORCE":
      return DiagnosticSeverity.Error;
  }
}

// Basic conversion from GraphQLError.SourceLocation to Range
function locationToRange(location: { line: number; column: number }): Range {
  const pos1 = new Position(location["line"] - 1, location["column"]);
  const pos2 = new Position(location["line"] - 1, location["column"]);
  return new Range(pos1, pos2);
}

/**
 * Calls the DataConnect.StreamCompileErrors api.
 * Converts ReadableStream into Observable
 *  */

export async function getCompilerStream(
  configs: ResolvedDataConnectConfigs,
  dataConnectEndpoint: string,
): Promise<Observable<CompilerResponse>> {
  try {
    // TODO: eventually support multiple services
    const serviceId = configs.serviceIds[0];
    const resp = await backOff(() =>
      fetch(
        dataConnectEndpoint + `/emulator/stream_errors?serviceId=${serviceId}`,
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
    ): Observable<CompilerResponse> {
      stream.pause();

      return new Observable((observer) => {
        function dataHandler(data: string) {
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
