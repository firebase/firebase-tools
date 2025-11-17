import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

export interface Template {
  // Name of the directory that the template resides in (eg. templates/<name>)
  name: string;
  platform: TemplatePlatform;
}

export enum TemplatePlatform {
  NODE,
}

export const templates = [
  {
    name: "next-app-hello-world",
    platform: TemplatePlatform.NODE,
  },
  {
    name: "next-app-rules-simple",
    platform: TemplatePlatform.NODE,
  },
  {
    name: "next-app-rules-medium-task-master",
    platform: TemplatePlatform.NODE,
  },
] as const;

export type TemplateName = (typeof templates)[number]["name"];

export function copyTemplate(name: TemplateName, runDir: string) {
  const templateDir = path.resolve(path.join("templates", name));
  const templateContents = fs.readdirSync(templateDir);
  for (const item of templateContents) {
    const srcPath = path.join(templateDir, item);
    const destPath = path.join(runDir, item);
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
}

export async function buildTemplates(): Promise<void> {
  console.log("Building templates");
  for (const template of templates) {
    switch (template.platform) {
      case TemplatePlatform.NODE: {
        await buildNodeTemplate(template);
      }
    }
  }
}

export async function buildNodeTemplate(template: Template): Promise<void> {
  const templateDir = path.resolve(path.join("templates", template.name));
  if (fs.existsSync(path.join(templateDir, "node_modules"))) {
    return;
  }

  console.log(`Running \`npm install\` in template ${template.name}`);
  execSync("npm install", {
    cwd: templateDir,
    stdio: "inherit",
    timeout: 30000,
  });
}
