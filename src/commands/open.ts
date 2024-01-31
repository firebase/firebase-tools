import * as clc from "colorette";
import * as open from "open";

import { FirebaseError } from "../error";
import * as api from "../api";
import { Command } from "../command";
import { logger } from "../logger";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";
import { requireHostingSite } from "../requireHostingSite";

interface Link {
  name: string;
  arg: string;
  consolePath?: string;
  url?: string;
}

const LINKS: Link[] = [
  { name: "Analytics", arg: "analytics", consolePath: "/analytics" },
  { name: "Authentication: Providers", arg: "auth", consolePath: "/authentication/providers" },
  { name: "Authentication: Users", arg: "auth:users", consolePath: "/authentication/users" },
  { name: "Crash Reporting", arg: "crash", consolePath: "/crashlytics" },
  { name: "Database: Data", arg: "database", consolePath: "/database/data" },
  { name: "Database: Rules", arg: "database:rules", consolePath: "/database/rules" },
  { name: "Docs", arg: "docs", url: "https://firebase.google.com/docs" },
  { name: "Dynamic Links", arg: "links", consolePath: "/durablelinks" },
  { name: "Firestore: Data", arg: "firestore", consolePath: "/firestore/data" },
  { name: "Firestore: Rules", arg: "firestore:rules", consolePath: "/firestore/rules" },
  { name: "Firestore: Indexes", arg: "firestore:indexes", consolePath: "/firestore/indexes" },
  {
    name: "Firestore: Databases List",
    arg: "firestore:databases:list",
    consolePath: "/firestore/databases/list",
  },
  {
    name: "Firestore: Locations",
    arg: "firestore:locations",
    consolePath: "/firestore/locations",
  },
  { name: "Firestore: Usage", arg: "firestore:usage", consolePath: "/firestore/usage" },
  { name: "Functions", arg: "functions", consolePath: "/functions/list" },
  { name: "Functions Log", arg: "functions:log" } /* Special Case */,
  { name: "Hosting: Deployed Site", arg: "hosting:site" } /* Special Case */,
  { name: "Hosting", arg: "hosting", consolePath: "/hosting/sites" },
  { name: "Notifications", arg: "notifications", consolePath: "/notification" },
  { name: "Project Dashboard", arg: "dashboard", consolePath: "/overview" },
  { name: "Project Settings", arg: "settings", consolePath: "/settings/general" },
  {
    name: "Remote Config: Conditions",
    arg: "config:conditions",
    consolePath: "/config/conditions",
  },
  { name: "Remote Config", arg: "config", consolePath: "/config" },
  { name: "Storage: Files", arg: "storage", consolePath: "/storage/files" },
  { name: "Storage: Rules", arg: "storage:rules", consolePath: "/storage/rules" },
  { name: "Test Lab", arg: "testlab", consolePath: "/testlab/histories/" },
];

const CHOICES = LINKS.map((l) => l.name);

export const command = new Command("open [link]")
  .description("quickly open a browser to relevant project resources")
  .before(requirePermissions)
  .before(requireDatabaseInstance)
  .before(requireHostingSite)
  .action(async (linkName: string, options: any): Promise<void> => {
    let link = LINKS.find((l) => l.arg === linkName);
    if (linkName && !link) {
      throw new FirebaseError(
        "Unrecognized link name. Valid links are:\n\n" + LINKS.map((l) => l.arg).join("\n"),
      );
    }

    if (!link) {
      const name = await promptOnce({
        type: "list",
        message: "What link would you like to open?",
        choices: CHOICES,
      });
      link = LINKS.find((l) => l.name === name);
    }
    if (!link) {
      throw new FirebaseError(
        "Unrecognized link name. Valid links are:\n\n" + LINKS.map((l) => l.arg).join("\n"),
      );
    }

    let url;
    if (link.consolePath) {
      url = utils.consoleUrl(options.project, link.consolePath);
    } else if (link.url) {
      url = link.url;
    } else if (link.arg === "hosting:site") {
      url = utils.addSubdomain(api.hostingOrigin, options.site);
    } else if (link.arg === "functions:log") {
      url = `https://console.developers.google.com/logs/viewer?resource=cloudfunctions.googleapis.com&project=${options.project}`;
    } else {
      throw new FirebaseError(`Unable to determine URL for link: ${link}`);
    }

    if (link.arg !== linkName) {
      logger.info(
        `${clc.bold(clc.cyan("Tip:"))} You can also run ${clc.bold(
          clc.underline(`firebase open ${link.arg}`),
        )}`,
      );
      logger.info();
    }
    logger.info(`Opening ${clc.bold(link.name)} link in your default browser:`);
    logger.info(clc.bold(clc.underline(url)));

    open(url);
  });
