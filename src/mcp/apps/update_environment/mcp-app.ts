import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
} from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Update Firebase Environment", version: "1.0.0" });

interface FirebaseProject {
  projectId: string;
  displayName?: string;
  projectNumber?: string;
}

const projectListContainer = document.getElementById("project-list") as HTMLSelectElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
const statusBox = document.getElementById("status-box") as HTMLDivElement;

let projects: FirebaseProject[] = [];
let filteredProjects: FirebaseProject[] = [];
let selectedProjectId: string | null = null;

const envProjectIdEl = document.getElementById("env-project-id") as HTMLSpanElement;
const envUserEl = document.getElementById("env-user") as HTMLSpanElement;

function showStatus(message: string, type: "success" | "error" | "info") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`;
  statusBox.style.display = "block";
}

function renderProjects() {
  projectListContainer.innerHTML = "";

  if (filteredProjects.length === 0) {
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.textContent = "No projects found.";
    projectListContainer.appendChild(opt);
    return;
  }

  filteredProjects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.projectId;
    opt.textContent = p.displayName ? `${p.displayName} (${p.projectId})` : p.projectId;
    if (p.projectId === selectedProjectId) {
      opt.selected = true;
    }
    projectListContainer.appendChild(opt);
  });
}

projectListContainer.onchange = () => {
  selectedProjectId = projectListContainer.value;
  submitBtn.disabled = false;
};

let searchTimeout: ReturnType<typeof setTimeout>;
searchInput.oninput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const query = searchInput.value.toLowerCase().trim();
    if (query === "") {
      filteredProjects = projects;
    } else {
      filteredProjects = projects.filter((p) => {
        const name = (p.displayName || p.projectId).toLowerCase();
        const id = p.projectId.toLowerCase();
        return name.includes(query) || id.includes(query);
      });
    }
    renderProjects();
  }, 300);
};

submitBtn.onclick = async () => {
  if (!selectedProjectId) return;

  submitBtn.disabled = true;
  showStatus(`Updating active project to ${selectedProjectId}...`, "info");

  try {
    const result = await app.callServerTool({
      name: "firebase_update_environment",
      arguments: { active_project: selectedProjectId },
    });

    const textContent = result.content?.find((c) => c.type === "text");
    const text = textContent ? (textContent as { text: string }).text : "Update complete.";

    if (result.isError) {
      showStatus(text, "error");
      submitBtn.disabled = false;
    } else {
      showStatus(text, "success");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showStatus(`Error updating environment: ${msg}`, "error");
    submitBtn.disabled = false;
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.ontoolresult = (_result) => {
  // We can handle tool results if needed, but we rely on manual triggers for list_projects
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    const { top, right, bottom, left } = ctx.safeAreaInsets;
    document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }
};

(async () => {
  try {
    await app.connect();
    showStatus("Connecting to server...", "info");

    // Fetch current environment
    try {
      const envResult = await app.callServerTool({
        name: "firebase_get_environment",
        arguments: {},
      });
      const envData = envResult.structuredContent as {
        projectId?: string;
        authenticatedUser?: string;
      };
      if (envData) {
        envProjectIdEl.textContent = envData.projectId || "<NONE>";
        envUserEl.textContent = envData.authenticatedUser || "<NONE>";
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch environment:", msg);
      showStatus(`Failed to fetch environment: ${msg}`, "error");
    }

    // Fetch projects on load
    const result = await app.callServerTool({ name: "firebase_list_projects", arguments: {} });
    const data = result.structuredContent as { projects: FirebaseProject[] };

    if (data && data.projects) {
      projects = data.projects;
      filteredProjects = projects;
      renderProjects();
      showStatus("Projects loaded successfully.", "success");
      setTimeout(() => {
        if (statusBox.className === "status success") statusBox.style.display = "none";
      }, 3000);
    } else {
      showStatus("No projects returned from server.", "error");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showStatus(`Failed to load projects: ${msg}`, "error");
  }
})();
