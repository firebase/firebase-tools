import { App } from "@modelcontextprotocol/ext-apps";
import { Job } from "../../util/jobs";

const app = new App({ name: "firebase-deploy", version: "1.0.0" });

const deployBtn = document.getElementById("deploy-btn") as HTMLButtonElement;
const progressBar = document.getElementById("progress-bar") as HTMLProgressElement;
const progressContainer = document.getElementById("progress-container") as HTMLDivElement;
const statusList = document.getElementById("status-list") as HTMLDivElement;

function addLog(message: string, type: "info" | "success" | "error" = "info"): void {
  const item = document.createElement("div");
  item.className = `status-item ${type}`;
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  statusList.appendChild(item);
  statusList.scrollTop = statusList.scrollHeight; // Auto-scroll
}

function updateProgress(percentage: number): void {
  progressBar.value = percentage;
}

function pollStatus(jobId: string): void {
  let loggedCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const interval = setInterval(async () => {
    try {
      const statusRes = await app.callServerTool({
        name: "firebase_deploy_status",
        arguments: { jobId },
      });

      if (statusRes.isError) {
        addLog(`Failed to poll status: ${JSON.stringify(statusRes.content)}`, "error");
        clearInterval(interval);
        deployBtn.disabled = false;
        deployBtn.textContent = "Deploy";
        return;
      }

      const job = statusRes.structuredContent as unknown as Job;
      if (job) {
        updateProgress(job.progress);

        // Incrementally draw new logs only
        const newLogs = job.logs.slice(loggedCount);
        newLogs.forEach((log: string) => addLog(log));
        loggedCount = job.logs.length;

        if (job.status === "success") {
          addLog("Deployment completed successfully!", "success");
          clearInterval(interval);
          deployBtn.disabled = false;
          deployBtn.textContent = "Deploy";
        } else if (job.status === "failed") {
          addLog(`Deployment failed: ${job.error || "Unknown error"}`, "error");
          clearInterval(interval);
          deployBtn.disabled = false;
          deployBtn.textContent = "Deploy";
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`Error during polling: ${message}`, "error");
      clearInterval(interval);
      deployBtn.disabled = false;
      deployBtn.textContent = "Deploy";
    }
  }, 2000);
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
deployBtn.addEventListener("click", async () => {
  // 1. Get checked targets
  const targets: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const checkboxes = document.querySelectorAll(
    '.checkbox-grid input[type="checkbox"]:checked',
  ) as NodeListOf<HTMLInputElement>;
  checkboxes.forEach((cb) => targets.push(cb.value));

  if (targets.length === 0) {
    addLog("Please select at least one service to deploy.", "error");
    return;
  }

  // 2. Disable UI
  deployBtn.disabled = true;
  deployBtn.textContent = "Deploying...";
  progressContainer.style.display = "block";
  statusList.innerHTML = ""; // Clear old logs
  updateProgress(10);
  addLog(`Starting deployment for: ${targets.join(", ")}`);

  // 3. Call tool
  try {
    const onlyArg = targets.join(",");
    addLog(`Calling firebase_deploy with only="${onlyArg}"...`);

    const result = await app.callServerTool({
      name: "firebase_deploy",
      arguments: { only: onlyArg },
    });

    if (result.isError) {
      addLog(`Deployment failed to start: ${JSON.stringify(result.content)}`, "error");
      updateProgress(0);
      deployBtn.disabled = false;
      deployBtn.textContent = "Deploy";
    } else {
      const jobId = (result.structuredContent as unknown as { jobId: string })?.jobId;
      if (jobId) {
        addLog(`Deployment started with Job ID: ${jobId}. Polling status...`);
        pollStatus(jobId);
      } else {
        addLog("Failed to get Job ID from server.", "error");
        deployBtn.disabled = false;
        deployBtn.textContent = "Deploy";
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    addLog(`Error calling deploy tool: ${message}`, "error");
    updateProgress(0);
    deployBtn.disabled = false;
    deployBtn.textContent = "Deploy";
  }
});

void (async () => {
  try {
    await app.connect();
    addLog("Connected to host.", "info");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to connect app:", message);
  }
})();
