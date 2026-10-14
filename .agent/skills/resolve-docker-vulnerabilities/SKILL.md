---
name: resolve-docker-vulnerabilities
description: Skill to resolve Docker vulnerabilities for the firebase-cli image. Use this skill when you need to check for vulnerabilities in the firebase-cli Docker image and address them.
---

# Resolve Docker Vulnerabilities

This skill guides you through the process of listing images, checking for vulnerabilities, planning remediation, and verifying the fixes by publishing to a staging repository.

## Workflow

### 1. Publish to Staging

Run the build on `fir-tools-builds` and publish to the `staging` repository in `firebase-cli` to see the baseline vulnerabilities after the build's own updates.

```bash
./scripts/publish/firebase-docker-image/run.sh --build-project fir-tools-builds --repo staging --target firebase-cli
```

### 2. Check Vulnerabilities

Check the vulnerability reports for the image just pushed to staging. You will need to find the digest of the image first.

```bash
gcloud artifacts docker images list us-docker.pkg.dev/firebase-cli/staging/firebase
```

Then check vulnerabilities using the digest:

```bash
gcloud artifacts vulnerabilities list us-docker.pkg.dev/firebase-cli/staging/firebase@sha256:<DIGEST>
```

To investigate which layers and file paths are causing the vulnerabilities, run the command with `--format=json`:

```bash
gcloud artifacts vulnerabilities list us-docker.pkg.dev/firebase-cli/staging/firebase@sha256:<DIGEST> --format=json
```

Look for `fileLocation` and `layerDetails` in the output to understand if the vulnerability is in:
- Project dependencies (e.g., under `/usr/local/node_packages/node_modules`). Recommend updating the package.json and running the build again. You can use overrides as needed here to upgrade transitive dependencies to non-breaking versions.
- Global tools (e.g., under `/usr/local/lib/node_modules/npm`). Recommend waiting for upstream fixes (which will be pulled in as soon as they are available).
- External binaries (e.g., emulator JARs under `/root/.cache/firebase/emulators`). Recommend raising these issues to the team owning the emulator.

### 3. Plan Remediation

For each vulnerable package identified:
- Determine if it can be updated in the Dockerfile.
- Check if a fix is available.
- Create a plan to address it (e.g., upgrading the base image, upgrading the specific package).

### 4. Present Plan to User

Present the proposed plan to the user for approval before making changes.

### 5. Apply Fix and Re-Verify

After making changes to the Dockerfile or related files, repeat Step 1 and Step 2 to publish a new staged image and verify that the vulnerabilities have been resolved.
