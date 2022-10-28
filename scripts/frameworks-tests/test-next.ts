import { exit } from 'process';
import { readdir, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import * as rimraf from 'rimraf';
import { pathExists } from 'fs-extra';

const site = process.env.FBTOOLS_TARGET_PROJECT!;
const cwd = join('scripts', 'frameworks-tests', 'next-project');
const bin = join(process.cwd(), 'lib', 'bin', 'firebase.js');

const run = async () => {
    // TODO flex init hosting
    rimraf.sync(cwd);
    execSync(`npx --yes create-next-app@latest -e hello-world ${basename(cwd)} --use-npm --ts`, { cwd: join(cwd, '..')});
    await writeFile(join(cwd, '.firebaserc'), '{}');
    await writeFile(join(cwd, 'firebase.json'), '{"hosting": {"source": "."}}');
    // Next is picking up the prettier settings from firebase-tools, sigh...
    await writeFile(join(cwd, "next.config.js"), "module.exports = { eslint: { ignoreDuringBuilds: true } };");
    execSync(`node ${bin} emulators:exec "exit 0" --project "${process.env.FBTOOLS_TARGET_PROJECT}"`, { cwd, stdio: "inherit", });
    if (!await pathExists(join(cwd, '.firebase'))) throw '.firebase does not exist';
    if (!await pathExists(join(cwd, '.firebase', site))) throw `.firebase/${site} does not exist`;
    if (!await pathExists(join(cwd, '.firebase', site, 'hosting'))) throw `.firebase/${site}/hosting does not exist`;
    if (!(await readdir(join(cwd, '.firebase', site, 'hosting'))).length) throw `no files in .firebase/${site}/hosting`;
    if (!await pathExists(join(cwd, '.firebase', site, 'functions'))) throw `.firebase/${site}/functions does not exist`;
    if (!(await readdir(join(cwd, '.firebase', site, 'functions'))).length) throw `no files in .firebase/${site}/functions`;
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
