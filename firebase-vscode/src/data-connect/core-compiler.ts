import * as vscode from "vscode";
import { Range, DiagnosticSeverity, Diagnostic, Uri, Position } from "vscode";
import fetch from "node-fetch";
import { GraphQLError } from "graphql";
import { Observable, of } from "rxjs";
import { backOff } from "exponential-backoff";
import { ResolvedDataConnectConfigs, dataConnectConfigs } from "./config";
import { DataConnectConfig } from "../firebaseConfig";

type DiagnosticTuple = [Uri, Diagnostic[]];
type CompilerResponse = { result?: { errors?: GraphQLError[] } };

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
  gqlErrors: GraphQLError[],
): DiagnosticTuple[] {
  const perFileDiagnostics = {};
  const dcPath = configs.values[0].path;
  for (const error of gqlErrors) {
    const absFilePath = `${dcPath}/${error.extensions["file"]}`;
    const perFileDiagnostic = perFileDiagnostics[absFilePath] || [];
    perFileDiagnostic.push({
      source: "Firebase Data Connect: Compiler",
      message: error.message,
      severity: DiagnosticSeverity.Error,
      range: locationToRange(error.locations[0]),
    } as Diagnostic);
    perFileDiagnostics[absFilePath] = perFileDiagnostic;
  }
  return Object.keys(perFileDiagnostics).map((key) => {
    return [
      Uri.file(key),
      perFileDiagnostics[key] as Diagnostic[],
    ] as DiagnosticTuple;
  });
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
