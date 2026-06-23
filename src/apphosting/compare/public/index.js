let activeTestCase = "";
let recordingsData = {};
let comparisonResults = [];
let activeUrlA = "";
let activeUrlB = "";
let activeDeployTimeA = 0;
let activeDeployTimeB = 0;
let lastMatrixData = null;

// Load settings from localStorage with robust fallbacks
const defaultIgnoreList = ["date", "etag", "x-cloud-trace-context", "x-powered-by", "connection", "keep-alive", "server-timing", "traceparent"];
let activeIgnoreList = defaultIgnoreList;
try {
  const storedIgnore = localStorage.getItem("apphosting_compare_ignore_headers");
  if (storedIgnore) {
    activeIgnoreList = JSON.parse(storedIgnore);
  }
} catch (e) {
  activeIgnoreList = defaultIgnoreList;
}

let activeScoringMode = "body";
try {
  const storedScoring = localStorage.getItem("apphosting_compare_scoring_mode");
  if (storedScoring) {
    activeScoringMode = storedScoring;
  }
} catch (e) {
  activeScoringMode = "body";
}

let isIgnoreCollapsed = false;
try {
  const storedCollapse = localStorage.getItem("apphosting_compare_ignore_collapsed");
  if (storedCollapse) {
    isIgnoreCollapsed = storedCollapse === "true";
  }
} catch (e) {
  isIgnoreCollapsed = false;
}

let activeColorMode = "absolute";
try {
  const storedColorMode = localStorage.getItem("apphosting_compare_color_mode");
  if (storedColorMode) {
    activeColorMode = storedColorMode;
  }
} catch (e) {
  activeColorMode = "absolute";
}

function saveSettings() {
  try {
    localStorage.setItem("apphosting_compare_ignore_headers", JSON.stringify(activeIgnoreList));
    localStorage.setItem("apphosting_compare_scoring_mode", activeScoringMode);
    localStorage.setItem("apphosting_compare_ignore_collapsed", String(isIgnoreCollapsed));
    localStorage.setItem("apphosting_compare_color_mode", activeColorMode);
  } catch (e) {}
}

// Sidebar Collapsible State
let isSidebarCollapsed = false;
try {
  const storedSidebar = localStorage.getItem("apphosting_compare_sidebar_collapsed");
  if (storedSidebar) {
    isSidebarCollapsed = storedSidebar === "true";
  }
} catch (e) {
  isSidebarCollapsed = false;
}

// Restore sidebar collapsed state on load
document.addEventListener("DOMContentLoaded", () => {
  if (isSidebarCollapsed) {
    const sidebar = document.querySelector(".sidebar");
    const btn = document.getElementById("sidebar-toggle-btn");
    if (sidebar) sidebar.classList.add("collapsed");
    if (btn) btn.classList.add("collapsed-active");
  }
});

function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const btn = document.getElementById("sidebar-toggle-btn");
  if (!sidebar || !btn) return;

  sidebar.classList.toggle("collapsed");
  btn.classList.toggle("collapsed-active");

  isSidebarCollapsed = sidebar.classList.contains("collapsed");
  try {
    localStorage.setItem("apphosting_compare_sidebar_collapsed", String(isSidebarCollapsed));
  } catch (e) {}
}

function applyColorMode() {
  const select = document.getElementById("select-color-mode");
  if (!select) return;
  activeColorMode = select.value;
  saveSettings();

  if (lastMatrixData) {
    applyMetadataFilters();
  }
}

function toggleIgnorePillsCollapse() {
  isIgnoreCollapsed = !isIgnoreCollapsed;
  saveSettings();
  applyIgnoreCollapseState();
}

function applyIgnoreCollapseState() {
  const wrapper = document.getElementById("ignore-pills-wrapper");
  const icon = document.getElementById("ignore-collapse-icon");
  if (!wrapper || !icon) return;

  if (isIgnoreCollapsed) {
    wrapper.style.maxHeight = "0px";
    icon.textContent = "Expand";
  } else {
    wrapper.style.maxHeight = "500px";
    icon.textContent = "Collapse";
  }
}

function getAvailableHeaders() {
  const defaultSuggestions = ["content-type", "cache-control", "content-encoding", "server-timing", "traceparent", "date", "etag", "x-cloud-trace-context", "x-powered-by", "connection", "keep-alive", "transfer-encoding", "vary", "strict-transport-security", "x-content-type-options", "x-frame-options", "x-xss-protection"];
  const set = new Set(defaultSuggestions);

  // If a detailed comparison is loaded, merge all active response headers!
  if (window.activeResObject) {
    if (window.activeResObject.variantA && window.activeResObject.variantA.headers) {
      Object.keys(window.activeResObject.variantA.headers).forEach(h => set.add(h.toLowerCase()));
    }
    if (window.activeResObject.variantB && window.activeResObject.variantB.headers) {
      Object.keys(window.activeResObject.variantB.headers).forEach(h => set.add(h.toLowerCase()));
    }
  }

  // Return sorted list of headers that are NOT currently ignored
  return Array.from(set)
    .filter(h => !activeIgnoreList.includes(h))
    .sort();
}

function renderIgnorePills() {
  const wrapper = document.getElementById("ignore-pills-wrapper");
  const countEl = document.getElementById("ignore-count");
  if (!wrapper || !countEl) return;

  countEl.textContent = activeIgnoreList.length;
  wrapper.innerHTML = "";

  // 1. Render active pills
  activeIgnoreList.forEach(header => {
    const pill = document.createElement("span");
    pill.className = "pill-badge";
    pill.textContent = header + " ";
    
    const removeBtn = document.createElement("span");
    removeBtn.className = "pill-remove-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeIgnoreHeader(header);
    };
    
    pill.appendChild(removeBtn);
    wrapper.appendChild(pill);
  });

  // 2. Render "+ Add Header" input wrapped in suggestion dropdown container
  const container = document.createElement("div");
  container.className = "add-pill-container";
  container.style.position = "relative";
  container.style.display = "inline-block";

  const input = document.createElement("input");
  input.type = "text";
  input.id = "add-pill-input";
  input.className = "add-pill-input";
  input.placeholder = "+ Add Header";
  input.autocomplete = "off";

  const dropdown = document.createElement("div");
  dropdown.id = "ignore-suggestions-dropdown";
  dropdown.style.display = "none";
  dropdown.style.position = "absolute";
  dropdown.style.top = "100%";
  dropdown.style.left = "0";
  dropdown.style.background = "var(--bg-dark)";
  dropdown.style.border = "1px solid var(--border)";
  dropdown.style.borderRadius = "4px";
  dropdown.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
  dropdown.style.zIndex = "1000";
  dropdown.style.minWidth = "160px";
  dropdown.style.maxHeight = "200px";
  dropdown.style.overflowY = "auto";
  dropdown.style.marginTop = "4px";

  // Hook up suggestions functions
  input.onfocus = () => showIgnoreSuggestions(input, dropdown);
  input.onblur = () => {
    // Delay hiding so that item click handler can trigger
    setTimeout(() => {
      dropdown.style.display = "none";
    }, 150);
  };
  input.oninput = () => filterIgnoreSuggestions(input, dropdown);

  const commitHeader = () => {
    const val = input.value.trim().toLowerCase();
    if (val.length > 0 && !activeIgnoreList.includes(val)) {
      activeIgnoreList.push(val);
      saveSettings();
      renderIgnorePills();
      triggerIgnoreRefresh();
    }
    input.value = "";
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      commitHeader();
    }
  };

  container.appendChild(input);
  container.appendChild(dropdown);
  wrapper.appendChild(container);
}

function showIgnoreSuggestions(input, dropdown) {
  const suggestions = getAvailableHeaders();
  renderSuggestionList(suggestions, input, dropdown);
  dropdown.style.display = "block";
}

function filterIgnoreSuggestions(input, dropdown) {
  const query = input.value.trim().toLowerCase();
  const suggestions = getAvailableHeaders().filter(h => h.includes(query));
  renderSuggestionList(suggestions, input, dropdown);
  dropdown.style.display = "block";
}

function renderSuggestionList(suggestions, input, dropdown) {
  dropdown.innerHTML = "";
  if (suggestions.length === 0) {
    const item = document.createElement("div");
    item.style.padding = "6px 10px";
    item.style.color = "var(--text-muted)";
    item.style.fontSize = "11px";
    item.textContent = "No suggestions";
    dropdown.appendChild(item);
    return;
  }

  suggestions.forEach(header => {
    const item = document.createElement("div");
    item.className = "ignore-suggestion-item";
    item.textContent = header;
    item.onmousedown = (e) => {
      // Prevent input blur before click
      e.preventDefault();
    };
    item.onclick = () => {
      activeIgnoreList.push(header);
      saveSettings();
      renderIgnorePills();
      triggerIgnoreRefresh();
    };
    dropdown.appendChild(item);
  });
}

function removeIgnoreHeader(header) {
  activeIgnoreList = activeIgnoreList.filter(h => h !== header.toLowerCase());
  saveSettings();
  renderIgnorePills();
  triggerIgnoreRefresh();
}

function toggleHeaderIgnoreState(header) {
  const canonical = header.toLowerCase();
  if (activeIgnoreList.includes(canonical)) {
    activeIgnoreList = activeIgnoreList.filter(h => h !== canonical);
  } else {
    activeIgnoreList.push(canonical);
  }
  saveSettings();
  renderIgnorePills();
  triggerIgnoreRefresh();
}

function triggerIgnoreRefresh() {
  // 1. Immediately re-filter current detailed headers table if active
  if (window.activeResObject && typeof window.renderActiveHeaders === "function") {
    window.renderActiveHeaders();
  }

  // 2. Debounce and refresh the heatmap/matrix grid
  if (activeTestCase) {
    if (window.ignoreTimeout) clearTimeout(window.ignoreTimeout);
    window.ignoreTimeout = setTimeout(() => {
      loadHeatmap(activeTestCase);
    }, 400);
  }
}

// Fetch list of recordings on load
async function loadRecordings() {
  const res = await fetch("/api/recordings");
  recordingsData = await res.json();

  const container = document.getElementById("test-cases-list");
  container.innerHTML = "";

  // Add GLOBAL test case
  const globalItem = document.createElement("div");
  globalItem.className = "list-item";
  globalItem.style.fontWeight = "bold";
  globalItem.style.color = "var(--accent)";
  globalItem.textContent = "GLOBAL MATRIX (All Apps)";
  globalItem.onclick = () => selectTestCase("GLOBAL", globalItem);
  container.appendChild(globalItem);

  Object.keys(recordingsData).forEach((tc) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.textContent = tc.replace(/_/g, " ");
    item.onclick = () => selectTestCase(tc, item);
    container.appendChild(item);
  });
}

async function selectTestCase(tc, element) {
  document.querySelectorAll("#test-cases-list .list-item").forEach(item => item.classList.remove("active"));
  element.classList.add("active");

  activeTestCase = tc;
  let variants = [];

  if (tc === "GLOBAL") {
    document.getElementById("filter-codebases-container").style.display = "flex";
    Object.keys(recordingsData).forEach(suite => {
      recordingsData[suite].forEach(v => variants.push(`${suite}/${v}`));
    });
  } else {
    document.getElementById("filter-codebases-container").style.display = "none";
    variants = recordingsData[tc];
  }

  // Populate Variant Dropdowns
  const selectA = document.getElementById("select-variant-a");
  const selectB = document.getElementById("select-variant-b");

  selectA.innerHTML = "";
  selectB.innerHTML = "";

  variants.forEach((v) => {
    const optA = document.createElement("option");
    optA.value = v;
    optA.textContent = v;
    const optB = optA.cloneNode(true);

    selectA.appendChild(optA);
    selectB.appendChild(optB);
  });

  // Select second option for B by default if available
  if (variants.length > 1) {
    selectB.selectedIndex = 1;
  }

  document.getElementById("variant-selection-section").style.display = "block";
  await loadHeatmap(tc);
}

// Close dropdowns if clicked outside
window.addEventListener("click", (e) => {
  document.querySelectorAll(".filter-dropdown-container").forEach(container => {
    if (!container.contains(e.target)) {
      container.classList.remove("open");
    }
  });
});

function toggleDropdown(container, event) {
  event.stopPropagation();
  const wasOpen = container.classList.contains("open");

  // Close other dropdowns
  document.querySelectorAll(".filter-dropdown-container").forEach(c => c.classList.remove("open"));

  if (!wasOpen) {
    container.classList.add("open");
    const searchInput = container.querySelector(".filter-search-box");
    if (searchInput) {
      searchInput.value = "";
      // Reset visibility of option items
      container.querySelectorAll(".filter-opt-item").forEach(item => item.style.display = "flex");
      searchInput.focus();
    }
  }
}

function filterDropdownOptions(input) {
  const query = input.value.toLowerCase();
  const container = input.closest(".filter-dropdown-container");
  container.querySelectorAll(".filter-opt-item").forEach(item => {
    const val = item.dataset.value.toLowerCase();
    if (val.includes(query)) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}

async function loadHeatmap(tc) {
  document.getElementById("dashboard-empty-state").style.display = "none";
  document.getElementById("heatmap-card").style.display = "flex";
  document.getElementById("routes-card").style.display = "none";
  document.getElementById("comparison-details").style.display = "none";

  // Trigger loading spinner overlay in heatmap container
  document.getElementById("heatmap-spinner").style.display = "flex";
  document.getElementById("heatmap-grid-container").style.opacity = "0.3";

  try {
    const mode = document.getElementById("select-scoring-mode").value;
    const ignoreVal = activeIgnoreList.join(",");
    const res = await fetch(`/api/matrix?testCase=${tc}&scoringMode=${encodeURIComponent(mode)}&ignoreHeaders=${encodeURIComponent(ignoreVal)}`);
    lastMatrixData = await res.json();

    // Reset search field
    document.getElementById("variant-search-input").value = "";

    // Build Dynamic Dropdown Filters
    const filtersBar = document.getElementById("heatmap-dynamic-filters");
    filtersBar.innerHTML = "";

    if (!lastMatrixData.variantsMetadata) {
      applyMetadataFilters();
      return;
    }

    // Gather unique values for each metadata property
    const properties = {};
    Object.values(lastMatrixData.variantsMetadata).forEach(meta => {
      Object.entries(meta).forEach(([key, val]) => {
        if (key === "id") return; // Skip ID

        properties[key] = properties[key] || new Set();
        if (key === "localBuild") {
          properties[key].add(val ? "Local" : "Source");
        } else {
          properties[key].add(val === undefined ? "default" : String(val));
        }
      });
    });

    // Render a dropdown for each property
    Object.entries(properties).forEach(([propName, valuesSet]) => {
      const uniqueValues = Array.from(valuesSet).sort();

      // Create Dropdown Container
      const container = document.createElement("div");
      container.className = "filter-dropdown-container";

      const btn = document.createElement("button");
      btn.className = "filter-dropdown-btn";
      
      // Title casing property name
      const displayProp = propName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      btn.textContent = `${displayProp}: All`;
      btn.onclick = (e) => toggleDropdown(container, e);

      const content = document.createElement("div");
      content.className = "filter-dropdown-content";

      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "filter-search-box";
      searchInput.placeholder = `Search ${displayProp.toLowerCase()}...`;
      searchInput.oninput = () => filterDropdownOptions(searchInput);

      const list = document.createElement("div");
      list.className = "filter-options-list";

      // Select All checkbox
      const allItem = document.createElement("label");
      allItem.className = "filter-opt-item";
      allItem.dataset.value = "all";
      
      const allCheck = document.createElement("input");
      allCheck.type = "checkbox";
      allCheck.checked = true;
      allCheck.onchange = () => {
        const checks = list.querySelectorAll("input[type='checkbox']");
        checks.forEach(c => {
          if (c !== allCheck) c.checked = allCheck.checked;
        });
        applyMetadataFilters();
      };
      
      allItem.appendChild(allCheck);
      allItem.appendChild(document.createTextNode("Select All"));
      list.appendChild(allItem);

      uniqueValues.forEach(val => {
        const item = document.createElement("label");
        item.className = "filter-opt-item";
        item.dataset.value = val;

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = true;
        check.dataset.property = propName;
        check.dataset.value = val;
        check.onchange = () => {
          // If any check is unchecked, uncheck "Select All"
          const otherChecks = Array.from(list.querySelectorAll("input[type='checkbox']")).filter(c => c !== allCheck);
          const allChecked = otherChecks.every(c => c.checked);
          allCheck.checked = allChecked;
          applyMetadataFilters();
        };

        item.appendChild(check);
        item.appendChild(document.createTextNode(val));
        list.appendChild(item);
      });

      content.appendChild(searchInput);
      content.appendChild(list);
      container.appendChild(btn);
      container.appendChild(content);
      filtersBar.appendChild(container);
    });

    applyMetadataFilters();
  } catch (err) {
    console.error("Error loading heatmap data:", err);
  } finally {
    // Hide loading spinner overlay
    document.getElementById("heatmap-spinner").style.display = "none";
    document.getElementById("heatmap-grid-container").style.opacity = "1.0";
  }
}

function applyMetadataFilters() {
  if (!lastMatrixData) return;

  const searchQuery = document.getElementById("variant-search-input").value.toLowerCase();
  const dropdownContainers = document.querySelectorAll(".filter-dropdown-container");
  
  // Build active filters map
  const activeFilters = {};
  dropdownContainers.forEach(container => {
    const checks = container.querySelectorAll("input[type='checkbox']");
    const labelBtn = container.querySelector(".filter-dropdown-btn");
    let propName = "";
    const selectedValues = [];
    let totalCount = 0;

    checks.forEach(c => {
      if (c.dataset.property) {
        propName = c.dataset.property;
        totalCount++;
        if (c.checked) {
          selectedValues.push(c.dataset.value);
        }
      }
    });

    if (propName) {
      activeFilters[propName] = selectedValues;
      const displayProp = propName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      if (selectedValues.length === totalCount) {
        labelBtn.textContent = `${displayProp}: All`;
      } else if (selectedValues.length === 0) {
        labelBtn.textContent = `${displayProp}: None`;
      } else if (selectedValues.length === 1) {
        labelBtn.textContent = `${displayProp}: ${selectedValues[0]}`;
      } else {
        labelBtn.textContent = `${displayProp}: ${selectedValues.length} selected`;
      }
    }
  });

  // Filter variants list
  const filteredVariants = lastMatrixData.variants.filter(v => {
    // 1. Text search filter
    if (searchQuery && !v.toLowerCase().includes(searchQuery)) {
      return false;
    }

    // 2. Dropdown metadata filters
    const meta = lastMatrixData.variantsMetadata ? lastMatrixData.variantsMetadata[v] : null;
    if (meta) {
      for (const [prop, allowedVals] of Object.entries(activeFilters)) {
        let actualVal = "";
        if (prop === "localBuild") {
          actualVal = meta[prop] ? "Local" : "Source";
        } else {
          actualVal = meta[prop] === undefined ? "default" : String(meta[prop]);
        }
        if (!allowedVals.includes(actualVal)) {
          return false;
        }
      }
    }

    return true;
  });

  renderMatrixTable(filteredVariants);
}

function applyMatrixFilter() {
  applyMetadataFilters();
}

function renderMatrixTable(variants) {
  const container = document.getElementById("heatmap-grid-container");
  container.innerHTML = "";

  if (variants.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); padding: 24px; text-align: center;">No matching variants found for active filters.</div>`;
    return;
  }

  // Calculate min and max similarity for relative coloring
  let minSim = 1.0;
  let maxSim = 0.0;
  let hasDiff = false;

  if (activeColorMode === "relative") {
    variants.forEach((vA) => {
      variants.forEach((vB) => {
        const row = lastMatrixData.matrix[vA];
        const similarity = row ? (row[vB] || 0.0) : 0.0;
        if (similarity < minSim) minSim = similarity;
        if (similarity > maxSim) maxSim = similarity;
      });
    });
    if (maxSim > minSim) {
      hasDiff = true;
    }
  }

  const table = document.createElement("table");
  table.className = "heatmap-table";

  // 1. Header Row
  const thead = document.createElement("tr");
  thead.appendChild(document.createElement("th")); // empty top-left corner
  variants.forEach((v) => {
    const th = document.createElement("th");
    th.className = "heatmap-header-cell";
    th.textContent = v;
    thead.appendChild(th);
  });
  table.appendChild(thead);

  // 2. Rows
  variants.forEach((vA) => {
    const tr = document.createElement("tr");

    // Row label
    const tdLabel = document.createElement("td");
    tdLabel.className = "heatmap-row-label";
    tdLabel.textContent = vA;
    tr.appendChild(tdLabel);

    variants.forEach((vB) => {
      const tdCell = document.createElement("td");
      tdCell.className = "heatmap-cell-wrapper";

      const inner = document.createElement("div");
      inner.className = "heatmap-cell-inner";

      const row = lastMatrixData.matrix[vA];
      const similarity = row ? (row[vB] || 0.0) : 0.0;
      const percent = Math.round(similarity * 100);
      inner.textContent = percent + "%";
      inner.dataset.codebaseA = vA.includes("/") ? vA.split("/")[0] : "";
      inner.dataset.codebaseB = vB.includes("/") ? vB.split("/")[0] : "";

      // Calculate hue based on absolute or relative mode
      let hue = 120;
      if (activeColorMode === "relative") {
        if (hasDiff) {
          const rel = (similarity - minSim) / (maxSim - minSim);
          hue = rel * 120;
        } else {
          hue = 120; // If all cells have identical similarity, color them green
        }
      } else {
        hue = similarity * 120; // Absolute mode (0% = HSL 0, 100% = HSL 120)
      }

      const bg = `hsla(${hue}, 70%, 42%, 0.85)`;
      inner.style.backgroundColor = bg;
      inner.title = `Similarity between ${vA} and ${vB}: ${percent}%`;

      // Clicking a cell triggers the comparison for vA and vB
      inner.onclick = () => {
        document.getElementById("select-variant-a").value = vA;
        document.getElementById("select-variant-b").value = vB;
        triggerComparison();
      };

      tdCell.appendChild(inner);
      tr.appendChild(tdCell);
    });

    table.appendChild(tr);
  });

  container.appendChild(table);

  // Apply codebase isolation filter if checked
  const isolateCodebases = document.getElementById("toggle-filter-codebases").checked;
  if (activeTestCase === "GLOBAL" && isolateCodebases) {
    const cells = document.querySelectorAll(".heatmap-cell-inner");
    cells.forEach((cell) => {
      const cA = cell.dataset.codebaseA;
      const cB = cell.dataset.codebaseB;
      if (cA && cB && cA !== cB) {
        cell.classList.add("de-emphasized");
      } else {
        cell.classList.remove("de-emphasized");
      }
    });
  }
}

function showHeatmapView() {
  document.getElementById("heatmap-card").style.display = "flex";
  document.getElementById("routes-card").style.display = "none";
  document.getElementById("comparison-details").style.display = "none";
}

async function triggerComparison() {
  const varA = document.getElementById("select-variant-a").value;
  const varB = document.getElementById("select-variant-b").value;

  if (!varA || !varB) {
    alert("Please select both Variant A and Variant B.");
    return;
  }

  // Hide heatmap card, show routes list card
  document.getElementById("heatmap-card").style.display = "none";
  document.getElementById("routes-card").style.display = "block";

  // Trigger compare API call
  const res = await fetch(`/api/compare?testCase=${encodeURIComponent(activeTestCase)}&variantA=${encodeURIComponent(varA)}&variantB=${encodeURIComponent(varB)}`);
  const data = await res.json();

  comparisonResults = data.results || data.routes || [];
  activeUrlA = data.urlA;
  activeUrlB = data.urlB;
  activeDeployTimeA = data.deployTimeA || 0;
  activeDeployTimeB = data.deployTimeB || 0;

  // Build routes list in sidebar
  const container = document.getElementById("routes-container");
  container.innerHTML = "";

  comparisonResults.forEach((res, idx) => {
    const item = document.createElement("div");
    item.className = "route-item";
    item.onclick = () => viewRouteDiff(idx, item);

    const routeSpan = document.createElement("span");
    routeSpan.className = "route-path";
    routeSpan.textContent = res.route;

    const badgeDiv = document.createElement("div");
    badgeDiv.className = "badges";

    const statusBadge = document.createElement("span");
    if (res.statusMatch) {
      statusBadge.className = "badge success";
      statusBadge.textContent = `Status: ${res.statusA}`;
    } else {
      statusBadge.className = "badge danger";
      statusBadge.textContent = `Status: ${res.statusA} vs ${res.statusB}`;
    }
    badgeDiv.appendChild(statusBadge);

    const bodyBadge = document.createElement("span");
    const percent = Math.round(res.bodySimilarity * 100);
    if (res.bodySimilarity === 1.0) {
      bodyBadge.className = "badge success";
      bodyBadge.textContent = `Body: 100%`;
    } else if (res.bodySimilarity >= 0.9) {
      bodyBadge.className = "badge warning";
      bodyBadge.textContent = `Body: ${percent}%`;
    } else {
      bodyBadge.className = "badge danger";
      bodyBadge.textContent = `Body: ${percent}%`;
    }
    badgeDiv.appendChild(bodyBadge);

    item.appendChild(routeSpan);
    item.appendChild(badgeDiv);
    container.appendChild(item);
  });

  // Auto-click first route to load it
  if (comparisonResults.length > 0) {
    container.firstElementChild.click();
  }
}

function viewRouteDiff(idx, element) {
  document.querySelectorAll("#routes-container .route-item").forEach(item => item.classList.remove("active"));
  if (element) {
    element.classList.add("active");
  }

  document.getElementById("comparison-details").style.display = "flex";

  const res = comparisonResults[idx];

  // Update Endpoint Links & Route Path Title
  document.getElementById("route-title-path").textContent = res.route;
  
  const linkA = document.getElementById("link-endpoint-a");
  linkA.href = activeUrlA + res.route;
  linkA.textContent = activeUrlA + res.route;

  const linkB = document.getElementById("link-endpoint-b");
  linkB.href = activeUrlB + res.route;
  linkB.textContent = activeUrlB + res.route;

  const iframeLinkA = document.getElementById("iframe-link-a");
  iframeLinkA.href = `/api/render?testCase=${encodeURIComponent(activeTestCase)}&variant=${encodeURIComponent(document.getElementById("select-variant-a").value)}&route=${encodeURIComponent(res.route)}`;
  
  const iframeLinkB = document.getElementById("iframe-link-b");
  iframeLinkB.href = `/api/render?testCase=${encodeURIComponent(activeTestCase)}&variant=${encodeURIComponent(document.getElementById("select-variant-b").value)}&route=${encodeURIComponent(res.route)}`;

  // Load variant render frames for visual split tab
  document.getElementById("iframe-a").src = iframeLinkA.href;
  document.getElementById("iframe-b").src = iframeLinkB.href;

  // 1. Status Code Parity Card
  const statusBox = document.getElementById("status-comparison-box");
  if (res.statusMatch) {
    statusBox.innerHTML = `<span class="badge success" style="font-size: 12px; padding: 4px 10px; font-weight: 600;">${res.statusA} Match</span>`;
  } else {
    statusBox.innerHTML = `<span class="badge danger" style="font-size: 12px; padding: 4px 10px; font-weight: 600;">${res.statusA} vs ${res.statusB}</span>`;
  }

  // 2. Variant A Performance Card
  const latencyA = res.latencyA ? `<span class="badge success" style="font-size: 12px; background: rgba(16, 185, 129, 0.1); color: var(--success); font-family: monospace; padding: 4px 10px;">${res.latencyA}ms</span>` : `<span style="color: var(--text-muted); font-size: 12px;">--</span>`;
  const deployA = activeDeployTimeA ? `<span class="badge" style="font-size: 12px; background: rgba(59, 130, 246, 0.1); color: var(--accent); font-family: monospace; padding: 4px 10px;">${Math.round(activeDeployTimeA / 1000)}s deploy</span>` : "";
  document.getElementById("metrics-variant-a").innerHTML = `${latencyA} ${deployA}`;

  // 3. Variant B Performance Card
  const latencyB = res.latencyB ? `<span class="badge success" style="font-size: 12px; background: rgba(16, 185, 129, 0.1); color: var(--success); font-family: monospace; padding: 4px 10px;">${res.latencyB}ms</span>` : `<span style="color: var(--text-muted); font-size: 12px;">--</span>`;
  const deployB = activeDeployTimeB ? `<span class="badge" style="font-size: 12px; background: rgba(59, 130, 246, 0.1); color: var(--accent); font-family: monospace; padding: 4px 10px;">${Math.round(activeDeployTimeB / 1000)}s deploy</span>` : "";
  document.getElementById("metrics-variant-b").innerHTML = `${latencyB} ${deployB}`;

  // 2. HTTP Headers comparison (merged list with dynamic UI filtering)
  const headersTbody = document.getElementById("headers-comparison-tbody");

  const renderHeaders = () => {
    headersTbody.innerHTML = "";
    
    const ignoreList = activeIgnoreList;

    const mergedDiffs = [];
    res.headerMismatches.forEach(h => {
      const isIgnored = ignoreList.includes(h.header.toLowerCase());
      mergedDiffs.push({ ...h, critical: !isIgnored });
    });
    if (res.expectedHeaderVariations) {
      res.expectedHeaderVariations.forEach(h => {
        const isIgnored = ignoreList.includes(h.header.toLowerCase());
        mergedDiffs.push({ ...h, critical: !isIgnored });
      });
    }

    // Sort alphabetically, placing critical mismatches on top
    mergedDiffs.sort((x, y) => {
      if (x.critical !== y.critical) {
        return x.critical ? -1 : 1;
      }
      return x.header.localeCompare(y.header);
    });

    if (mergedDiffs.length === 0) {
      headersTbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted); text-align:center;">All response headers are identical</td></tr>';
    } else {
      mergedDiffs.forEach(h => {
        const badgeHtml = h.critical
          ? '<span class="badge danger" style="padding: 2px 6px;">Critical Mismatch</span>'
          : '<span class="badge warning" style="padding: 2px 6px; background-color: rgba(255, 255, 255, 0.03); color: var(--text-muted); border: 1px solid var(--border);">Ignored Variation</span>';
        
        const tr = document.createElement("tr");
        if (!h.critical) {
          tr.style.opacity = "0.5";
        }
        
        const td1 = document.createElement("td");
        td1.style.fontFamily = "monospace";
        td1.style.fontWeight = "500";
        td1.textContent = h.header + " ";

        // Hover-revealed inline action button to toggle ignore state
        const actionBtn = document.createElement("span");
        actionBtn.className = "header-row-action";
        actionBtn.textContent = h.critical ? "Ignore" : "Unignore";
        actionBtn.onclick = (e) => {
          e.stopPropagation();
          toggleHeaderIgnoreState(h.header);
        };
        td1.appendChild(actionBtn);
        
        const td2 = document.createElement("td");
        td2.style.color = h.critical ? 'var(--danger)' : 'var(--text-muted)';
        td2.style.fontFamily = "monospace";
        td2.style.fontSize = "11px";
        td2.style.wordBreak = "break-all";
        td2.textContent = h.valA || '(missing)';
        
        const td3 = document.createElement("td");
        td3.style.color = h.critical ? 'var(--success)' : 'var(--text-muted)';
        td3.style.fontFamily = "monospace";
        td3.style.fontSize = "11px";
        td3.style.wordBreak = "break-all";
        td3.textContent = h.valB || '(missing)';
        
        const td4 = document.createElement("td");
        td4.innerHTML = badgeHtml;

        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tr.appendChild(td4);
        headersTbody.appendChild(tr);
      });
    }
  };
  window.activeResObject = res;
  window.renderActiveHeaders = renderHeaders;

  renderHeaders();

  // 4. Code Body Diff
  const diffContainer = document.getElementById("body-diff-container");
  diffContainer.innerHTML = "";

  if (res.isBinary) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent = "Binary File Comparison: " + (res.bodyDiff || "Identical");
    diffContainer.appendChild(div);
  } else if (res.bodySimilarity === 1.0) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>Response Bodies are 100% Identical</div>
    `;
    diffContainer.appendChild(div);
  } else if (!res.diffChanges || res.diffChanges.length === 0) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent = "No text differences recorded";
    diffContainer.appendChild(div);
  } else {
    // Render GitHub style beautiful side-scrolled diff
    const diffView = document.createElement("div");
    diffView.className = "diff-view";

    const diffElements = [];

    res.diffChanges.forEach((change) => {
      const lines = change.value.split("\n");
      if (lines.length > 1 && lines[lines.length - 1] === "") {
        lines.pop();
      }

      if (!change.added && !change.removed) {
        if (lines.length > 10) {
          const topLines = lines.slice(0, 3);
          const bottomLines = lines.slice(-3);
          const hiddenCount = lines.length - 6;

          const renderLines = (arr) => {
             arr.forEach(line => {
               const row = document.createElement("div"); row.className = "diff-line";
               const prefix = document.createElement("span"); prefix.className = "diff-prefix"; prefix.textContent = " ";
               const text = document.createElement("span"); text.className = "diff-text"; text.textContent = line;
               row.appendChild(prefix); row.appendChild(text);
               diffView.appendChild(row);
             });
          };

          renderLines(topLines);
          
          const expandBtn = document.createElement("div");
          expandBtn.style.cursor = "pointer";
          expandBtn.style.backgroundColor = "rgba(255,255,255,0.05)";
          expandBtn.style.padding = "6px 8px";
          expandBtn.style.textAlign = "center";
          expandBtn.style.color = "var(--accent)";
          expandBtn.style.fontSize = "11px";
          expandBtn.style.margin = "6px 0";
          expandBtn.style.borderRadius = "4px";
          expandBtn.style.border = "1px dashed var(--border)";
          expandBtn.textContent = "Expand " + hiddenCount + " unchanged lines...";
          
          const hiddenContainer = document.createElement("div");
          hiddenContainer.style.display = "none";
          const middleLines = lines.slice(3, -3);
          middleLines.forEach(line => {
             const row = document.createElement("div"); row.className = "diff-line";
             const prefix = document.createElement("span"); prefix.className = "diff-prefix"; prefix.textContent = " ";
             const text = document.createElement("span"); text.className = "diff-text"; text.textContent = line;
             row.appendChild(prefix); row.appendChild(text);
             hiddenContainer.appendChild(row);
          });
          expandBtn.onclick = () => {
            expandBtn.style.display = "none";
            hiddenContainer.style.display = "block";
          };
          diffView.appendChild(expandBtn);
          diffView.appendChild(hiddenContainer);

          renderLines(bottomLines);
        } else {
          lines.forEach(line => {
             const row = document.createElement("div"); row.className = "diff-line";
             const prefix = document.createElement("span"); prefix.className = "diff-prefix"; prefix.textContent = " ";
             const text = document.createElement("span"); text.className = "diff-text"; text.textContent = line;
             row.appendChild(prefix); row.appendChild(text);
             diffView.appendChild(row);
          });
        }
      } else {
        const chunkContainer = document.createElement("div");
        chunkContainer.style.borderLeft = "2px solid " + (change.added ? "var(--success)" : "var(--danger)");
        chunkContainer.style.margin = "4px 0";
        diffElements.push(chunkContainer);

        lines.forEach(line => {
           const row = document.createElement("div"); row.className = "diff-line";
           if (change.added) row.classList.add("added");
           if (change.removed) row.classList.add("removed");
           
           const prefix = document.createElement("span"); prefix.className = "diff-prefix"; 
           prefix.textContent = change.added ? "+" : "-";
           
           const text = document.createElement("span"); text.className = "diff-text"; 
           text.textContent = line;
           
           row.appendChild(prefix); row.appendChild(text);
           chunkContainer.appendChild(row);
        });
        diffView.appendChild(chunkContainer);
      }
    });

    diffContainer.appendChild(diffView);

    let currentDiff = 0;
    const counterEl = document.getElementById("diff-counter");
    const updateNav = () => {
      if (!counterEl) return;
      counterEl.textContent = diffElements.length > 0 ? (currentDiff + 1) + "/" + diffElements.length : "0/0";
      if (diffElements.length > 0) {
         diffElements.forEach(el => el.style.backgroundColor = "transparent");
         diffElements[currentDiff].style.backgroundColor = "rgba(59, 130, 246, 0.1)";
         diffElements[currentDiff].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    
    const prevBtn = document.getElementById("prev-diff");
    if (prevBtn) {
      prevBtn.onclick = () => {
         if (diffElements.length === 0) return;
         currentDiff = (currentDiff - 1 + diffElements.length) % diffElements.length;
         updateNav();
      };
    }
    const nextBtn = document.getElementById("next-diff");
    if (nextBtn) {
      nextBtn.onclick = () => {
         if (diffElements.length === 0) return;
         currentDiff = (currentDiff + 1) % diffElements.length;
         updateNav();
      };
    }
    updateNav();
  }
}

function switchRightTab(tabId) {
  document.getElementById("tab-code-diff").classList.remove("active");
  document.getElementById("tab-code-diff").style.borderBottom = "none";
  document.getElementById("tab-code-diff").style.color = "var(--text-muted)";
  
  document.getElementById("tab-visual").classList.remove("active");
  document.getElementById("tab-visual").style.borderBottom = "none";
  document.getElementById("tab-visual").style.color = "var(--text-muted)";

  document.getElementById("body-diff-container").style.display = "none";
  document.getElementById("visual-render-container").style.display = "none";

  if (tabId === 'code') {
    document.getElementById("tab-code-diff").classList.add("active");
    document.getElementById("tab-code-diff").style.borderBottom = "2px solid var(--accent)";
    document.getElementById("tab-code-diff").style.color = "var(--text)";
    document.getElementById("body-diff-container").style.display = "block";
  } else if (tabId === 'visual') {
    document.getElementById("tab-visual").classList.add("active");
    document.getElementById("tab-visual").style.borderBottom = "2px solid var(--accent)";
    document.getElementById("tab-visual").style.color = "var(--text)";
    document.getElementById("visual-render-container").style.display = "flex";
  }
}

// Global Event Listeners for Controls Bar
document.getElementById("select-scoring-mode").onchange = () => {
  activeScoringMode = document.getElementById("select-scoring-mode").value;
  saveSettings();
  if (activeTestCase) {
    loadHeatmap(activeTestCase);
  }
};

window.onload = async () => {
  // 1. Set scoring mode and coloring mode dropdown values from localStorage
  document.getElementById("select-scoring-mode").value = activeScoringMode;
  document.getElementById("select-color-mode").value = activeColorMode;
  
  // 2. Render ignore pills and set collapse state
  renderIgnorePills();
  applyIgnoreCollapseState();
  
  // 3. Trigger initial recordings load
  await loadRecordings();
};
