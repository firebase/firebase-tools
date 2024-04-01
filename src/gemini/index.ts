import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as fs from "fs";
import * as path from "path";
import { promptOnce } from "../prompt";
import { execSync } from "child_process";
import * as clc from "colorette";

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

    let data = fs.readFileSync(path.join(TEMPLATE_ROOT, "gemini", "preamble.txt"), "utf8");
    data = data + fs.readFileSync(path.join(TEMPLATE_ROOT, "gemini", "commandReadme.txt"), "utf8");
    return data;
  } catch (err) {
    throw new FirebaseError("Error reading preamble file" + err);
  }
}

async function run(prompt: string): Promise<string> {
  let result;
  try {
    const newPrompt = getPreamble() + prompt;
    logger.debug("Running prompt: " + newPrompt);
    result = await model.generateContent(newPrompt);
  } catch (error) {
    console.error("Promise rejected with error: " + error);
  }
  const response = await result.response;
  return response.text();
}

export const ask = async function (prompt: string) {
  const responseText = await run(prompt);
  logger.info(clc.bold("Gemini Responded:"));
  if (
    responseText.length > 0 &&
    responseText[0] === "`" &&
    responseText[responseText.length - 1] === "`"
  ) {
    // Assume this is a single command with backticks on each side.
    const trimmedResponse = responseText.slice(1, responseText.length - 1);
    logger.info(trimmedResponse);
    const runNow = await promptOnce({
      type: "confirm",
      name: "runNow",
      message: `Would you like to run this command?`,
      default: true,
    });

    // Try to add the role to the service account
    if (runNow) {
      logger.info("Running: " + trimmedResponse);
      const newCommandOutput = execSync(trimmedResponse).toString(); // Doesn't output to console correctly
      // TODO(christhompson): This doesn't transition well, only good for one-off commands that
      // don't spawn long running subprocesses (not like emulators:start).
      logger.info(newCommandOutput);
    }
  } else {
    logger.info(responseText);
  }
};
