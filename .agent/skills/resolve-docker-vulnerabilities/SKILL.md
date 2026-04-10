---
name: resolve-docker-vulnerabilities
description: Skill to resolve Docker vulnerabilities for the firebase-cli image. Use this skill when you need to check for vulnerabilities in the firebase-cli Docker image and address them.
---

# Resolve Docker Vulnerabilities

This skill guides you through the process of listing images, checking for vulnerabilities, planning remediation, and verifying the fixes by publishing to a staging repository.

## Workflow

### 1. List Images

Use `gcloud` to list the images in the repository to find the latest one.

```bash
gcloud artifacts docker images list us-docker.pkg.dev/firebase-cli/us/firebase
```

### 2. Check Vulnerabilities

Check the vulnerability reports for the latest image. You will need the digest of the image from the previous step.

```bash
gcloud artifacts vulnerabilities list --resource=us-docker.pkg.dev/firebase-cli/us/firebase@sha256:<DIGEST>
```

### 3. Plan Remediation

For each vulnerable package identified:
- Determine if it can be updated in the Dockerfile.
- Check if a fix is available.
- Create a plan to address it (e.g., upgrading the base image, upgrading the specific package).

### 4. Present Plan to User

Present the proposed plan to the user for approval before making changes.

### 5. Verify and Publish to Staging

After making changes to the Dockerfile or related files, offer the user to publish a new copy of the image to a staging repo to verify the fix.

Example command to build and push to staging:
```bash
docker build -t us-docker.pkg.dev/firebase-cli/us/firebase-staging:latest .
docker push us-docker.pkg.dev/firebase-cli/us/firebase-staging:latest
```
Then you can check vulnerabilities on the staging image:
```bash
gcloud artifacts vulnerabilities list --resource=us-docker.pkg.dev/firebase-cli/us/firebase-staging:latest
```
