"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doSetup = void 0;
const clc = require("colorette");
const node_fs_1 = require("node:fs");
const path_1 = require("path");
const apiv2_1 = require("../../../apiv2");
const github_1 = require("./github");
const prompt_1 = require("../../../prompt");
const logger_1 = require("../../../logger");
const frameworks_1 = require("../../../frameworks");
const constants_1 = require("../../../frameworks/constants");
const experiments = require("../../../experiments");
const getDefaultHostingSite_1 = require("../../../getDefaultHostingSite");
const utils_1 = require("../../../utils");
const interactive_1 = require("../../../hosting/interactive");
const templates_1 = require("../../../templates");
const INDEX_TEMPLATE = (0, templates_1.readTemplateSync)("init/hosting/index.html");
const MISSING_TEMPLATE = (0, templates_1.readTemplateSync)("init/hosting/404.html");
const DEFAULT_IGNORES = ["firebase.json", "**/.*", "**/node_modules/**"];
/**
 * Does the setup steps for Firebase Hosting.
 * WARNING: #6527 - `options` may not have all the things you think it does.
 */
async function doSetup(setup, config, options) {
    var _a, _b, _c, _d;
    var _e, _f, _g;
    setup.hosting = {};
    // There's a path where we can set up Hosting without a project, so if
    // if setup.projectId is empty, we don't do any checking for a Hosting site.
    if (setup.projectId) {
        let hasHostingSite = true;
        try {
            await (0, getDefaultHostingSite_1.getDefaultHostingSite)({ projectId: setup.projectId });
        }
        catch (err) {
            if (err !== getDefaultHostingSite_1.errNoDefaultSite) {
                throw err;
            }
            hasHostingSite = false;
        }
        if (!hasHostingSite) {
            // N.B. During prompt migration this did not pass options object, so there is no support
            // for force or nonInteractive; there possibly should be.
            const confirmCreate = await (0, prompt_1.confirm)({
                message: "A Firebase Hosting site is required to deploy. Would you like to create one now?",
                default: true,
            });
            if (confirmCreate) {
                const createOptions = {
                    projectId: setup.projectId,
                    nonInteractive: options.nonInteractive,
                };
                const newSite = await (0, interactive_1.interactiveCreateHostingSite)("", "", createOptions);
                logger_1.logger.info();
                (0, utils_1.logSuccess)(`Firebase Hosting site ${(0, utils_1.last)(newSite.name.split("/"))} created!`);
                logger_1.logger.info();
            }
        }
    }
    let discoveredFramework = experiments.isEnabled("webframeworks")
        ? await (0, frameworks_1.discover)(config.projectDir, false)
        : undefined;
    if (experiments.isEnabled("webframeworks")) {
        if (discoveredFramework) {
            const name = frameworks_1.WebFrameworks[discoveredFramework.framework].name;
            (_a = (_e = setup.hosting).useDiscoveredFramework) !== null && _a !== void 0 ? _a : (_e.useDiscoveredFramework = await (0, prompt_1.confirm)({
                message: `Detected an existing ${name} codebase in the current directory, should we use this?`,
                default: true,
            }));
        }
        if (setup.hosting.useDiscoveredFramework) {
            setup.hosting.source = ".";
            setup.hosting.useWebFrameworks = true;
        }
        else {
            setup.hosting.useWebFrameworks = await (0, prompt_1.confirm)(`Do you want to use a web framework? (${clc.bold("experimental")})`);
        }
    }
    if (setup.hosting.useWebFrameworks) {
        (_b = (_f = setup.hosting).source) !== null && _b !== void 0 ? _b : (_f.source = await (0, prompt_1.input)({
            message: "What folder would you like to use for your web application's root directory?",
            default: "hosting",
        }));
        if (setup.hosting.source !== ".")
            delete setup.hosting.useDiscoveredFramework;
        discoveredFramework = await (0, frameworks_1.discover)((0, path_1.join)(config.projectDir, setup.hosting.source));
        if (discoveredFramework) {
            const name = frameworks_1.WebFrameworks[discoveredFramework.framework].name;
            (_c = (_g = setup.hosting).useDiscoveredFramework) !== null && _c !== void 0 ? _c : (_g.useDiscoveredFramework = await (0, prompt_1.confirm)({
                message: `Detected an existing ${name} codebase in ${setup.hosting.source}, should we use this?`,
                default: true,
            }));
        }
        if (setup.hosting.useDiscoveredFramework && discoveredFramework) {
            setup.hosting.webFramework = discoveredFramework.framework;
        }
        else {
            const choices = [];
            for (const value in frameworks_1.WebFrameworks) {
                if (frameworks_1.WebFrameworks[value]) {
                    const { name, init } = frameworks_1.WebFrameworks[value];
                    if (init)
                        choices.push({ name, value });
                }
            }
            const defaultChoice = (_d = choices.find(({ value }) => value === (discoveredFramework === null || discoveredFramework === void 0 ? void 0 : discoveredFramework.framework))) === null || _d === void 0 ? void 0 : _d.value;
            setup.hosting.whichFramework =
                setup.hosting.whichFramework ||
                    (await (0, prompt_1.select)({
                        message: "Please choose the framework:",
                        default: defaultChoice,
                        choices,
                    }));
            if (discoveredFramework)
                (0, node_fs_1.rmSync)(setup.hosting.source, { recursive: true });
            await frameworks_1.WebFrameworks[setup.hosting.whichFramework].init(setup, config);
        }
        setup.hosting.region =
            setup.hosting.region ||
                (await (0, prompt_1.select)({
                    message: "In which region would you like to host server-side content, if applicable?",
                    default: constants_1.DEFAULT_REGION,
                    choices: constants_1.ALLOWED_SSR_REGIONS.filter((region) => region.recommended),
                }));
        setup.config.hosting = {
            source: setup.hosting.source,
            // TODO swap out for framework ignores
            ignore: DEFAULT_IGNORES,
            frameworksBackend: {
                region: setup.hosting.region,
            },
        };
    }
    else {
        logger_1.logger.info();
        logger_1.logger.info(`Your ${clc.bold("public")} directory is the folder (relative to your project directory) that`);
        logger_1.logger.info(`will contain Hosting assets to be uploaded with ${clc.bold("firebase deploy")}. If you`);
        logger_1.logger.info("have a build process for your assets, use your build's output directory.");
        logger_1.logger.info();
        setup.hosting.public =
            setup.hosting.public ||
                (await (0, prompt_1.input)({
                    message: "What do you want to use as your public directory?",
                    default: "public",
                }));
        setup.hosting.spa =
            setup.hosting.spa ||
                (await (0, prompt_1.confirm)("Configure as a single-page app (rewrite all urls to /index.html)?"));
        setup.config.hosting = {
            public: setup.hosting.public,
            ignore: DEFAULT_IGNORES,
        };
    }
    setup.hosting.github =
        setup.hosting.github || (await (0, prompt_1.confirm)("Set up automatic builds and deploys with GitHub?"));
    if (!setup.hosting.useWebFrameworks) {
        if (setup.hosting.spa) {
            setup.config.hosting.rewrites = [{ source: "**", destination: "/index.html" }];
        }
        else {
            // SPA doesn't need a 404 page since everything is index.html
            await config.askWriteProjectFile(`${setup.hosting.public}/404.html`, MISSING_TEMPLATE);
        }
        const c = new apiv2_1.Client({ urlPrefix: "https://www.gstatic.com", auth: false });
        const response = await c.get("/firebasejs/releases.json");
        await config.askWriteProjectFile(`${setup.hosting.public}/index.html`, INDEX_TEMPLATE.replace(/{{VERSION}}/g, response.body.current.version));
    }
    if (setup.hosting.github) {
        return (0, github_1.initGitHub)(setup);
    }
}
exports.doSetup = doSetup;
