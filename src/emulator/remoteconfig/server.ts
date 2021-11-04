import * as express from "express";
import { RemoteConfigEmulator } from "./index";
import * as cors from "cors";
import {cloneDeep} from "lodash";

/**
 * @param defaultProjectId
 * @param emulator
 */
export function createApp(
  defaultProjectId: string,
  emulator: RemoteConfigEmulator
): Promise<express.Express> {
  const app = express();
  app.use(cors("*" as any));

  // Test SDK endpoint
  app.get("/", (req, res) => {
    res.send("Oh yes, it's me, remote config 🥸");
  });

  // Please note you should set the Remote Config minimal fetch interval to 0 so it refreshes every time
  // Otherwise caching will cause you headaches
  app.post("/v1/projects/:projectId/namespaces/firebase:fetch", (req, res) => {
    res.header("etag", `etag-${req.params["projectId"]}-firebase-fetch--${new Date().getTime()}`);
    res.header(
      "Access-Control-expose-Headers",
      "etag,vary,vary,vary,content-encoding,date,server,content-length"
    );

    res.json(generateClientResponse(emulator.template));
  });

  // Admin SDK endpoints
  app.get("/v1/projects/:projectId/remoteConfig", (req, res) => {
    if (req.query.clientType === "emulator") {
      res.json(emulator.template);
    } else {
      // extract !isEmulator conditional value
      res.json(extractEmulator(emulator.template));
    }
  });

  app.put("/v1/projects/:projectId/remoteConfig", express.json({ inflate: false }), (req, res) => {
    // TODO(kroikie): validate incoming template
    // Set incoming template as emulator template.
    emulator.template = emulator.prepareEmulatorTemplate(req.body);
    res.status(200).send("OK");
  });

  return Promise.resolve(app);
}

function extractEmulator(emulatorTemplate: any): any {
  const nonEmulatorTemplate = cloneDeep(emulatorTemplate);
  const emulatorParameters = nonEmulatorTemplate["parameters"] || {};
  for (const parameterName of Object.keys(emulatorParameters)) {
    const emulatorParameter = emulatorParameters[parameterName];
    const conditionalValues = emulatorParameter["conditionalValues"];
    if (Object.values(conditionalValues).length > 1) {
      delete conditionalValues["!isEmulator"];
    } else {
      delete emulatorParameter["conditionalValues"];
    }
  }
  return nonEmulatorTemplate;
}

function generateClientResponse(template: any): any {
  const parameters = template["parameters"];
  const entriesObj: any = {};
  for (const parameterName of Object.keys(parameters)) {
    entriesObj[parameterName] = parameters[parameterName].conditionalValues["!isEmulator"].value;
  }
  return {
    entries: entriesObj,
    state: "UPDATE",
  };
}
