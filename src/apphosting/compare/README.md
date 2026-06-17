# App Hosting Comparison Tool

The App Hosting Comparison Tool (`firebase apphosting:compare` and `firebase apphosting:compare-suite`) is an autonomous differential testing tool. It allows developers and CI/CD systems to deploy, crawl, and compare two different versions or configurations of an application on Firebase App Hosting, asserting parity across status codes, response headers, and body payloads (text diffs and binary hashes).

---

## Commands

### `firebase apphosting:compare`

Deploys and compares two versions of an application.

```bash
firebase apphosting:compare \
  --path-b <path-to-canary-dir> \
  [--path-a <path-to-stable-dir>] \
  [--location <location>] \
  [--output-dir <report-output-dir>]
```

**Options:**
* `--path-b` (Required): The directory path containing the version to compare against (e.g. your canary/experimental branch).
* `--path-a` (Optional): The directory path containing the baseline version (e.g. your stable branch). Defaults to the current working directory (`.`).
* `--location` (Optional): The GCP location where App Hosting backends should reside. Defaults to `us-central1`.
* `--output-dir` (Optional): The directory path where comparison results and the dashboard will be written. Defaults to `./compare-report`.

---

### `firebase apphosting:compare-suite`

Runs a batch of comparison tests on multiple codebases defined in a JSON suite config.

```bash
firebase apphosting:compare-suite \
  --suite-config <path-to-json-file> \
  [--location <location>] \
  [--output-dir <report-output-dir>]
```

**Suite Config Format (`suite.json`):**
```json
[
  {
    "name": "nextjs-reference",
    "pathA": "./apps/nextjs-reference/stable",
    "pathB": "./apps/nextjs-reference/canary"
  },
  {
    "name": "nextjs-sample",
    "pathA": "./next-sample-1",
    "pathB": "./next-sample-1-modified"
  }
]
```

---

## Core Architecture

### 1. Quota & Slot Pool Management
To work around the standard project limit of **10 backends per project**, the tool manages a leased pool of **5 parallel comparison slots** (`compare-slot-1` to `compare-slot-5`).
* Each slot contains an A/B pair of backends: `compare-slot-X-a` and `compare-slot-X-b`.
* Slot backends are dynamically created upon first run and **kept alive (reused)** for subsequent runs, reducing rollout provisioning time by ~2 minutes.
* State is managed via GCP labels (`status: busy`, `status: idle`, `last_active: <timestamp>`).
* If a run is interrupted (`SIGINT`/`SIGTERM`), a signal handler cleans up resources and releases the slot lock.
* A startup GC sweeper automatically releases slot locks held `busy` for more than 2 hours.

### 2. Secret manager Isolation
If the codebases reference Google Cloud Secret Manager values in their `apphosting.yaml` configurations, the tool:
* Automatically provisions mock sandboxed secrets (prefixed with `cmp-sec-[slot]-`) to prevent naming conflicts.
* Grants read access to the slot backend's Cloud Run service account.
* Safely removes the mock secrets from Secret Manager when the comparison concludes.

### 3. Route Discovery
The comparison engine discovers routes using a two-pass mechanism:
* **Static Discovery**: Parses local Next.js build manifests (e.g., `.next/routes-manifest.json`, `.next/prerender-manifest.json`) and local `sitemap.xml` files.
* **Dynamic Crawling**: Executes a recursive HTML link crawler on Backend A to dynamically harvest links, query strings, and redirects (up to 5 redirect levels) at runtime.

### 4. Differential Analyzer
Once routes are collected, the analyzer queries the matching paths on both backends and performs:
* **Status Match**: Asserts status code parity (e.g. `200` vs `200`, `404` vs `404`).
* **Header Auditing**: Separates expected dynamic headers (`x-cloud-trace-context`, `date`, `etag`, `age`) from static behavioral headers (`content-type`, `cache-control`) to detect regression.
* **Payload Comparison**:
  * **Text/HTML**: Computes Myers' line-level diffs and Sorensen-Dice similarity scores to match dynamic content.
  * **Binary Assets**: Compares exact size (bytes) and SHA-256 payload hashes.

### 5. Premium Dashboard
The comparison run outputs:
* **`summary.json`**: Machine-readable JSON structured logs of every mismatch, status code, and similarity score.
* **`index.html`**: A responsive, modern dark-mode HTML split-pane code diff viewer, letting you visually compare the precise lines that changed on each page.
