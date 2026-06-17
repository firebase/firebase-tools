# App Hosting N-Way Matrix Comparison Tool

This is an experimental internal CLI tool built for the Firebase App Hosting team to dynamically verify the compatibility and performance of different infrastructure backends or application builds. 

It takes an array of $N$ configurations (variants) and automatically deploys them, discovering their routes, and dumping an $O(N^2)$ Pair-wise Cartesian Matrix of differences.

## Capabilities

1. **Standard CLI Fidelity**: Deployments are executed by automatically constructing a temporary `firebase.json` and programmatically calling the `firebase deploy` CLI execution path. This guarantees that test deployments faithfully mirror the actual customer experience (including Secrets, AutoInit Env Vars, and custom headers).
2. **Local vs Remote Build Verification**: Can deploy locally built bundles (e.g. `localBuild: true`) side-by-side with remote Cloud Build source zips.
3. **Automated IAM & Secrets Management**: Intelligently creates a single mock secret in Secret Manager for each distinct codebase path, mapping the IAM `secretAccessor` roles simultaneously to all backends generated from that codebase.
4. **Dynamic Spidering**: Automatically crawls Next.js / Angular apps recursively starting from `/` to discover hidden dynamic routes, alongside statically parsing `.next/prerender-manifest.json`.
5. **Exact Diff Inspection**: Generates HTML dashboards, JSON summaries, and specifically dumps the raw HTTP HTML outputs of each variant so engineers can run local diffs.

## Usage

1. Create a `matrix-test.json` file to define your test cases:

```json
[
  {
    "name": "Node Matrix Test",
    "variants": [
      {
        "id": "Local-Node24",
        "path": "../next-sample-1",
        "localBuild": true,
        "runtime": "nodejs24"
      },
      {
        "id": "Source-Node24",
        "path": "../next-sample-1",
        "localBuild": false,
        "runtime": "nodejs24"
      },
      {
        "id": "Source-Node22",
        "path": "../next-sample-1",
        "localBuild": false,
        "runtime": "nodejs22"
      }
    ]
  }
]
```

2. Run the command:

```bash
FIREBASE_CLI_EXPERIMENTS=apphosting firebase apphosting:compare-suite --project <your-project> --suite-config matrix-test.json
```

## How to Inspect Diffs

When the command completes, it generates reports in the `./compare-report/<TestCaseName>/` directory.
Inside this folder, you will see a subfolder for each pairwise comparison, such as `Local-Node24-vs-Source-Node24/`.

Inside the pair folder:
- **`index.html`**: A beautifully styled visual dashboard showing percentage differences and mismatches.
- **`summary.json`**: The structured data representation.
- **`backendA/` and `backendB/`**: These folders contain the raw HTTP HTML bodies retrieved during the crawl! 

To manually inspect the exact diffs, you can use standard diff tools on the generated files:

```bash
diff compare-report/Node\ Matrix\ Test/Local-Node24-vs-Source-Node24/backendA/index.html compare-report/Node\ Matrix\ Test/Local-Node24-vs-Source-Node24/backendB/index.html
```

Or you can right-click the files in VSCode and select "Select for Compare" and "Compare with Selected".
