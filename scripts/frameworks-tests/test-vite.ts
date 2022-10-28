import { exit } from 'process';
import { readdir, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import * as rimraf from 'rimraf';
import { pathExists } from 'fs-extra';

const site = process.env.FBTOOLS_TARGET_PROJECT!;
const cwd = join('scripts', 'frameworks-tests', 'vite-project');
const bin = join(process.cwd(), 'lib', 'bin', 'firebase.js');

const run = async () => {
    // TODO flex init hosting
    rimraf.sync(cwd);
    execSync(`npm create vite@latest ${basename(cwd)} --yes -- --template vanilla`, { cwd: join(cwd, '..')});
    execSync("npm i", { cwd });
    await writeFile(join(cwd, '.firebaserc'), '{}');
    await writeFile(join(cwd, 'firebase.json'), '{"hosting": {"source": "."}}');
    execSync(`node ${bin} emulators:exec "exit 0" --project "${process.env.FBTOOLS_TARGET_PROJECT}"`, { cwd, stdio: "inherit", });
    if (!await pathExists(join(cwd, '.firebase'))) throw '.firebase does not exist';
    if (!await pathExists(join(cwd, '.firebase', site))) throw `.firebase/${site} does not exist`;
    if (!await pathExists(join(cwd, '.firebase', site, 'hosting'))) throw `.firebase/${site}/hosting does not exist`;
    if (!(await readdir(join(cwd, '.firebase', site, 'hosting'))).length) throw `no files in .firebase/${site}/hosting`;
}

run().then(
    () => exit(0),
    err => {
        console.error(err.message || err);
        const logPath = join(cwd, 'firebase-debug.log');
        if (existsSync(logPath)) console.log(readFileSync(logPath).toString());
        exit(1);
    }
);

export {};
