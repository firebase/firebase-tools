"use strict";

const clc = require("cli-color");
const fs = require("fs");

const { Client } = require("../../../apiv2");
const { initGitHub } = require("./github");
const { prompt } = require("../../../prompt");
const logger = require("../../../logger");

const INDEX_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/index.html",
  "utf8"
);
const MISSING_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/404.html",
  "utf8"
);
const DEFAULT_IGNORES = ["firebase.json", "**/.*", "**/node_modules/**"];

module.exports = function(setup, config, options) {
  setup.hosting = {};

  logger.info();
  logger.info(
    "Your " +
      clc.bold("public") +
      " directory is the folder (relative to your project directory) that"
  );
  logger.info(
    "will contain Hosting assets to be uploaded with " + clc.bold("firebase deploy") + ". If you"
  );
  logger.info("have a build process for your assets, use your build's output directory.");
  logger.info();

  return prompt(setup.hosting, [
    {
      name: "public",
      type: "input",
      default: "public",
      message: "What do you want to use as your public directory?",
    },
    {
      name: "spa",
      type: "confirm",
      default: false,
      message: "Configure as a single-page app (rewrite all urls to /index.html)?",
    },
    {
      name: "github",
      type: "confirm",
      default: false,
      message: "Set up automatic builds and deploys with GitHub?",
    },
  ]).then(function() {
    setup.config.hosting = {
      public: setup.hosting.public,
      ignore: DEFAULT_IGNORES,
    };

    let next;
    if (setup.hosting.spa) {
      setup.config.hosting.rewrites = [{ source: "**", destination: "/index.html" }];
      next = Promise.resolve();
    } else {
      // SPA doesn't need a 404 page since everything is index.html
      next = config.askWriteProjectFile(setup.hosting.public + "/404.html", MISSING_TEMPLATE);
    }

    return next
      .then(() => {
        const c = new Client({ urlPrefix: "https://www.gstatic.com", auth: false });
        return c.get("/firebasejs/releases.json");
      })
      .then((response) => {
        return config.askWriteProjectFile(
          setup.hosting.public + "/index.html",
          INDEX_TEMPLATE.replace(/{{VERSION}}/g, response.body.current.version)
        );
      })
      .then(() => {
        if (setup.hosting.github) {
          return initGitHub(setup, config, options);
        }
      });
  });
};
