"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doSetup = void 0;
const logger_1 = require("../../logger");
const utils = require("../../utils");
const auth_1 = require("../../auth");
const error_1 = require("../../error");
const prompt_1 = require("../../prompt");
async function promptForAccount() {
    logger_1.logger.info();
    logger_1.logger.info(`Which account do you want to use for this project? Choose an account or add a new one now`);
    logger_1.logger.info();
    const allAccounts = (0, auth_1.getAllAccounts)();
    const choices = allAccounts.map((a) => {
        return {
            name: a.user.email,
            value: a.user.email,
        };
    });
    choices.push({
        name: "(add a new account)",
        value: "__add__",
    });
    const emailChoice = await (0, prompt_1.select)({
        message: "Please select an option:",
        choices,
    });
    if (emailChoice === "__add__") {
        const newAccount = await (0, auth_1.loginAdditionalAccount)(/* useLocalhost= */ true);
        if (!newAccount) {
            throw new error_1.FirebaseError("Failed to add new account", { exit: 1 });
        }
        return newAccount;
    }
    else {
        return (0, auth_1.findAccountByEmail)(emailChoice);
    }
}
/**
 * Sets up the project default account.
 * @param setup A helper object to use for the rest of the init features.
 * @param config Configuration for the project.
 * @param options Command line options.
 */
async function doSetup(setup, config, options) {
    let account;
    if (options.account) {
        account = (0, auth_1.findAccountByEmail)(options.account);
        if (!account) {
            throw new error_1.FirebaseError(`Invalid account ${options.account}`, { exit: 1 });
        }
    }
    else {
        account = await promptForAccount();
    }
    if (!account) {
        throw new error_1.FirebaseError(`No account selected, have you run "firebase login"?`, { exit: 1 });
    }
    // Set the global auth state
    (0, auth_1.setActiveAccount)(options, account);
    // Set the project default user
    if (config.projectDir) {
        (0, auth_1.setProjectAccount)(config.projectDir, account.user.email);
    }
    logger_1.logger.info();
    utils.logSuccess(`Using account: ${account.user.email}`);
}
exports.doSetup = doSetup;
