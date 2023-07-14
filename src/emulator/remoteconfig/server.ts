import * as express from "express";
import { RemoteConfigEmulator } from "./index";
import * as cors from "cors";

/**
 * @param defaultProjectId Project ID used to start the emulator.
 * @param emulator Remote config emulator.
 * @returns Express app.
 */
export function createApp(
  defaultProjectId: string,
  emulator: RemoteConfigEmulator
): Promise<express.Express> {
  const app = express();
  app.use(cors("*" as any));

  app.put("/revert", (req, res) => {
    emulator.loadTemplate();
    res.json(emulator.template);
  });

  // Please note you should set the Remote Config minimal fetch interval to 0, so it refreshes every time
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
      res.json(RemoteConfigEmulator.extractEmulator(emulator.template));
    }
  });

  app.put("/v1/projects/:projectId/remoteConfig", express.json({ inflate: false }), (req, res) => {
    if (req.query.clientType === "emulator") {
      const validationResp = RemoteConfigEmulator.validateRemoteConfigEmulatorTemplate(req.body);
      if (validationResp.valid) {
        // Set incoming template as emulator template.
        emulator.template = RemoteConfigEmulator.prepareEmulatorTemplate(req.body);
        res.status(200).send("OK");
      } else {
        res.status(400).send(validationResp.msg);
      }
    } else {
      const validationResp = RemoteConfigEmulator.validateRemoteConfigTemplate(req.body);
      if (validationResp.valid) {
        // Set incoming template as emulator template.
        emulator.template = RemoteConfigEmulator.prepareEmulatorTemplate(req.body);
        res.status(200).send("OK");
      } else {
        res.status(400).send(validationResp.msg);
      }
    }
  });

  return Promise.resolve(app);
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
