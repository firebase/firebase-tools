/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as http from "http";
import type { ListenOptions } from "net";
import * as path from "path";

import * as express from "express";
import fetch from "node-fetch";
import { AnalyticsSession } from "../../track";
import { ExperimentName } from "../../experiments";
import { FirebaseError } from "../../error";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators } from "../types";

/*
  This file defines Node.js server-side logic for the Emulator UI.

  It is a facsimile class of the local server in firebase-tools-ui/server.ts. For that reason, 
  values that were previously environment variables are passed in rather than fetched/derived 
  in the class itself.
*/
export async function createApp(
  zipDirPath: string,
  projectId: string,
  hubHost: string,
  emulatorGaSession: AnalyticsSession | undefined,
  listenOptions: ListenOptions[],
  experiments: Array<ExperimentName>): Promise<http.Server[]> {

  const app = express();
  // Exposes the host and port of various emulators to facilitate accessing
  // them using client SDKs. For features that involve multiple emulators or
  // hard to accomplish using client SDKs, consider adding an API below.
  app.get(
    '/api/config',
    jsonHandler(async () => {
      const hubDiscoveryUrl = new URL(`http://${hubHost}/emulators`);
      const emulatorsRes = await fetch(hubDiscoveryUrl.toString());
      const emulators = (await emulatorsRes.json()) as any;

      const json = { projectId, experiments: [], ...emulators };

      // Googlers: see go/firebase-emulator-ui-usage-collection-design?pli=1#heading=h.jwz7lj6r67z8
      // for more detail
      if (emulatorGaSession) {
        json.analytics = emulatorGaSession;
      }

      // pick up any experiments enabled with `firebase experiment:enable`
      if (experiments) {
        json.experiments = experiments;
      }

      return json;
    })
  );

  const webDir = path.join(zipDirPath, 'client');
  app.use(express.static(webDir));
  // Required for the router to work properly.
  app.get('*', function (_, res) {
    res.sendFile(path.join(webDir, 'index.html'));
  });

  if (listenOptions.length == 0) {
    throw new FirebaseError("Failed to start UI server, listenOptions empty");
  }
  var servers : http.Server[] = [];
  for (const opts of listenOptions) {
    var server = http.createServer(app).listen(opts)
    servers.push(server);
    server.once('listening', () => {
      EmulatorLogger.forEmulator(Emulators.UI).log("DEBUG", `Web / API server started at ${opts.host}:${opts.port}`);
    });
    server.once('error', (err) => {
      EmulatorLogger.forEmulator(Emulators.UI).log("ERROR", `Failed to start server at ${opts.host}:${opts.port}. ${err}`);
      if (opts === listenOptions[0]) {
        // If we failed to listen on the primary address, surface the error.
        throw new FirebaseError(`Failed to start server for the primary address at ${opts.host}:${opts.port}`);
      }
    });
  }

  return servers
}

function jsonHandler(
  handler: (req: express.Request) => Promise<object>
): express.Handler {
  return (req, res) => {
    handler(req).then(
      (body) => {
        res.status(200).json(body);
      },
      (err) => {
        EmulatorLogger.forEmulator(Emulators.UI).log("ERROR", err);
        res.status(500).json({
          message: err.message,
          stack: err.stack,
          raw: err,
        });
      }
    );
  };
}
