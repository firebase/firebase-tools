
import { FirebaseError } from "../error";
import * as utils from "../utils";
import { logger } from "../logger";
import * as fs from "fs";
import * as path from "path";
import { promptOnce } from "../prompt";
import { execSync } from "child_process";

const { GoogleGenerativeAI } = require("@google/generative-ai");

// TODO(christhompson): Do we have an endpoint that's open and doesn't require a project w/ billing?
// Estimated QPS is around 1.
// TODO(christhompson): Add project ID for this.
// TODO(christhompson): Add preamble information about command flags.
// TODO(christhompson): Figure out how to test this.
const generationConfig = {
    maxOutputTokens: 200,
    temperature: 0.9,
    topP: 0.1,
    topK: 16,
};

const genAI = new GoogleGenerativeAI("AIzaSyDDqii7EVJbMgfC3vhp3ER2o-EYa9qOSQw");
const model = genAI.getGenerativeModel({ model: "gemini-pro", generationConfig });

function getPreamble(): string {
    try {
        const TEMPLATE_ROOT = path.resolve(__dirname, "../../templates/");

        var data = fs.readFileSync(path.join(TEMPLATE_ROOT, "gemini", "preamble.txt"), "utf8");
        data = data + fs.readFileSync(path.join(TEMPLATE_ROOT, "gemini", "commandReadme.txt"), "utf8");
        return data;
    } catch (err) {
        throw new FirebaseError(
            "Error reading preamble file" + err
        );
    }
}

async function run(prompt: string): Promise<string> {
    // For text-only input, use the gemini-pro model

    var result;
    try {
        const newPrompt = getPreamble() + prompt;
        console.log('New prompt: ' + newPrompt);
        result = await model.generateContent(newPrompt);
        console.log('Promise resolved with value: ' + result);
    } catch (error) {
        console.error('Promise rejected with error: ' + error);
    }
    logger.info("waiting on result");
    const response = await result.response;

    logger.info("run done");
    return response.text();
}

export const ask = async function (prompt: string) {

    logger.info("starting ask");

    const responseText = await run(prompt);
    logger.info("Gemini Responded:");
    if (responseText.length > 0 && responseText[0] === "`" && responseText[responseText.length - 1] === "`") {
        // Assume this is a single command with backticks on each side.
        const trimmedResponse = responseText.slice(1, responseText.length - 1);
        logger.info(trimmedResponse);
        const runNow = await promptOnce(
            {
                type: "confirm",
                name: "runNow",
                message: `Would you like to run this command?`,
                default: true,
            }
        );

        // Try to add the role to the service account
        if (runNow) {
            console.log("running: " + trimmedResponse);
            const asdf = execSync(trimmedResponse).toString(); // Doesn't output to console correctly
            // TODO(christhompson): This doesn't transition well, only good for one-off commands that
            // don't spawn long running subprocesses (like emulators:start).
            console.log(asdf);
        }
    } else {
        console.log(responseText);
    }
}