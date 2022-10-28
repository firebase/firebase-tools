import { exit } from 'process';
import { readdir, access, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import * as rimraf from 'rimraf';

const site = 'nextjs-demo-73e34';
const cwd = join('scripts', 'frameworks-tests', 'next-project');
const bin = join(process.cwd(), 'lib', 'bin', 'firebase.js');

const run = async () => {
    // TODO flex init hosting
    rimraf.sync(cwd);
    execSync(`npx create-next-app ${basename(cwd)} --use-npm --ts`, { cwd: join(cwd, '..')});
    await writeFile(join(cwd, '.firebaserc'), '{"projects": {"default": "nextjs-demo-73e34"}}');
    await writeFile(join(cwd, 'firebase.json'), '{"hosting": {"source": "."}}');
    execSync(`node ${bin} emulators:exec "exit 0"`, { cwd });
    if (await access(join(cwd, '.firebase')).then(() => false, () => true)) throw '.firebase does not exist';
    if (await access(join(cwd, '.firebase', site)).then(() => false, () => true)) throw `.firebase/${site} does not exist`;
    if (await access(join(cwd, '.firebase', site, 'hosting')).then(() => false, () => true)) throw `.firebase/${site}/hosting does not exist`;
    if (!(await readdir(join(cwd, '.firebase', site, 'hosting'))).length) throw `no files in .firebase/${site}/hosting`;
    if (await access(join(cwd, '.firebase', site, 'functions')).then(() => false, () => true)) throw `.firebase/${site}/functions does not exist`;
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
