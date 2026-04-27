import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
} from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Update Firebase Environment", version: "1.0.0" });

const projectListContainer = document.getElementById("project-list") as HTMLDivElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
const statusBox = document.getElementById("status-box") as HTMLDivElement;

interface Project {
  projectId: string;
  displayName?: string;
}

let projects: Project[] = [];
let filteredProjects: Project[] = [];
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
    projectListContainer.innerHTML = `
      <div class="dropdown-item" style="cursor: default;">
        <div class="item-name">No projects found.</div>
      </div>
    `;
    return;
  }

  filteredProjects.forEach((p) => {
    const item = document.createElement("div");
    item.className = "dropdown-item";
    if (p.projectId === selectedProjectId) {
      item.classList.add("selected");
    }

    const displayName = p.displayName || p.projectId;
    const projectId = p.projectId;

    item.innerHTML = `
      <div class="item-name">${displayName}</div>
      <div class="item-id">${projectId}</div>
    `;

    item.onclick = () => {
      selectedProjectId = projectId;
      submitBtn.disabled = false;
      renderProjects(); // Re-render to show selection
    };

    projectListContainer.appendChild(item);
  });
}

searchInput.oninput = () => {
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

    const textContent = result.content?.find((c: any) => c.type === "text");
    const text = textContent ? (textContent as any).text : "Update complete.";

    if (result.isError) {
      showStatus(text, "error");
      submitBtn.disabled = false;
    } else {
      showStatus(text, "success");
    }
  } catch (err: any) {
    showStatus(`Error updating environment: ${err.message}`, "error");
    submitBtn.disabled = false;
  }
};

app.onhostcontextchanged = (ctx: any) => {
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
      const envData = envResult.structuredContent as any;
      if (envData) {
        envProjectIdEl.textContent = envData.projectId || "<NONE>";
        envUserEl.textContent = envData.authenticatedUser || "<NONE>";
      }
    } catch (err: any) {
      console.error("Failed to fetch environment:", err);
      showStatus(`Failed to fetch environment: ${err.message}`, "error");
    }

    // Fetch projects on load
    const result = await app.callServerTool({ name: "firebase_list_projects", arguments: {} });
    const data = result.structuredContent as any;

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
  } catch (err: any) {
    showStatus(`Failed to load projects: ${err.message}`, "error");
  }
})();
