"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFlutterApp = exports.createNextApp = exports.createReactApp = void 0;
const child_process_1 = require("child_process");
const clc = require("colorette");
const utils_1 = require("../../../utils");
/** Create a React app using vite react template. */
async function createReactApp(webAppId) {
    const args = ["create", "vite@latest", webAppId, "--", "--template", "react"];
    await executeCommand("npm", args);
}
exports.createReactApp = createReactApp;
/** Create a Next.js app using create-next-app. */
async function createNextApp(webAppId) {
    const args = ["create-dataconnect-nextjs", "-n", webAppId];
    await executeCommand("npx", args);
}
exports.createNextApp = createNextApp;
/** Create a Flutter app using flutter create. */
async function createFlutterApp(webAppId) {
    const args = ["create", webAppId];
    await executeCommand("flutter", args);
}
exports.createFlutterApp = createFlutterApp;
// Function to execute a command asynchronously and pipe I/O
async function executeCommand(command, args) {
    (0, utils_1.logLabeledBullet)("dataconnect", `> ${clc.bold(`${command} ${args.join(" ")}`)}`);
    return new Promise((resolve, reject) => {
        // spawn returns a ChildProcess object
        const childProcess = (0, child_process_1.spawn)(command, args, {
            // 'inherit' pipes stdin, stdout, and stderr to the parent process
            stdio: "inherit",
            // Runs the command in a shell, which allows for shell syntax like pipes, etc.
            shell: true,
        });
        childProcess.on("close", (code) => {
            if (code === 0) {
                // Command executed successfully
                resolve();
            }
            else {
                // Command failed
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });
        childProcess.on("error", (err) => {
            // Handle errors like command not found
            reject(err);
        });
    });
}
