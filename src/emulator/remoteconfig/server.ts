import * as express from "express";
import { RemoteConfigEmulator } from "./index";

/**
 * @param defaultProjectId
 * @param emulator
 */
export function createApp(
  defaultProjectId: string,
  emulator: RemoteConfigEmulator
): Promise<express.Express> {
  const app = express();

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

    res.json({
      entries: {
        remoteConfigFieldName: "remoteConfigFieldValue",
      },
      state: "UPDATE",
    });
  });

  return Promise.resolve(app);
}
