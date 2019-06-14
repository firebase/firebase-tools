import * as _ from "lodash";
import * as clc from "cli-color";
import * as open from "open";

import * as FirebaseError from "../error";
import * as api from "../api";
import * as Command from "../command";
import * as logger from "../logger";
import { promptOnce } from "../prompt";
import * as requirePermissions from "../requirePermissions";
import * as requireInstance from "../requireInstance";
import * as utils from "../utils";

interface Link {
  name: string;
  arg: string;
  consoleUrl?: string;
  url?: string;
}

const LINKS: Link[] = [
  { name: "Analytics", arg: "analytics", consoleUrl: "/analytics" },
  { name: "Authentication: Providers", arg: "auth", consoleUrl: "/authentication/providers" },
  { name: "Authentication: Users", arg: "auth:users", consoleUrl: "/authentication/users" },
  { name: "Crash Reporting", arg: "crash", consoleUrl: "/monitoring" },
  { name: "Database: Data", arg: "database", consoleUrl: "/database/data" },
  { name: "Database: Rules", arg: "database:rules", consoleUrl: "/database/rules" },
  { name: "Docs", arg: "docs", url: "https://firebase.google.com/docs" },
  { name: "Dynamic Links", arg: "links", consoleUrl: "/durablelinks" },
  { name: "Hosting: Deployed Site", arg: "hosting:site" },
  { name: "Hosting", arg: "hosting", consoleUrl: "/hosting/main" },
  { name: "Notifications", arg: "notifications", consoleUrl: "/notification" },
  { name: "Project Dashboard", arg: "dashboard", consoleUrl: "/overview" },
  { name: "Project Settings", arg: "settings", consoleUrl: "/settings/general" },
  { name: "Remote Config: Conditions", arg: "config:conditions", consoleUrl: "/config/conditions" },
  { name: "Remote Config", arg: "config", consoleUrl: "/config" },
  { name: "Storage: Files", arg: "storage", consoleUrl: "/storage/files" },
  { name: "Storage: Rules", arg: "storage:rules", consoleUrl: "/storage/rules" },
  { name: "Test Lab", arg: "testlab", consoleUrl: "/testlab/histories/" },
];

const CHOICES = _.map(LINKS, "name");

export default new Command("open [link]")
  .description("quickly open a browser to relevant project resources")
  .before(requirePermissions)
  .before(requireInstance)
  .action(
    async (linkName: string, options: any): Promise<void> => {
      let link = _.find(LINKS, { arg: linkName });
      if (linkName && !link) {
        throw new FirebaseError(
          "Unrecognized link name. Valid links are:\n\n" + _.map(LINKS, "arg").join("\n")
        );
      }

      if (!link) {
        const name = await promptOnce({
          type: "list",
          message: "What link would you like to open?",
          choices: CHOICES,
        });
        link = _.find(LINKS, { name });
      }
      if (!link) {
        throw new FirebaseError(
          "Unrecognized link name. Valid links are:\n\n" + _.map(LINKS, "arg").join("\n")
        );
      }

      let url;
      if (link.consoleUrl) {
        url = utils.consoleUrl(options.project, link.consoleUrl);
      } else if (link.url) {
        url = link.url;
      } else if (link.arg === "hosting:site") {
        url = utils.addSubdomain(api.hostingOrigin, options.instance);
      } else if (link.arg === "functions") {
        url = "https://console.firebase.google.com/project/" + options.project + "/functions/list";
      } else if (link.arg === "functions:log") {
        url =
          "https://console.developers.google.com/logs/viewer?resource=cloudfunctions.googleapis.com&project=" +
          options.project;
      } else {
        throw new FirebaseError(`Unable to determine URL for link: ${link}`);
      }

      if (link.arg !== linkName) {
        logger.info(
          `${clc.bold.cyan("Tip:")} You can also run ${clc.bold.underline(
            `firebase open ${link.arg}`
          )}`
        );
        logger.info();
      }
      logger.info(`Opening ${clc.bold(link.name)} link in your default browser:`);
      logger.info(clc.bold.underline(url));

      open(url);
    }
  );
