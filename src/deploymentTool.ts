export const BASE = "cli-firebase";

export function value() {
  if (!process.env.FIREBASE_DEPLOY_AGENT) {
    return BASE;
  }

  return [BASE, process.env.FIREBASE_DEPLOY_AGENT].join("--");
}

export function labels() {
  return {
    "deployment-tool": value(),
  };
}

export function isFirebaseManaged(labels: { [key: string]: any }) {
  return labels?.["deployment-tool"]?.startsWith(BASE);
}
