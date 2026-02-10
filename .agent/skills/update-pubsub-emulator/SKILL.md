---
name: Update Pub/Sub Emulator
description: How to update the Pub/Sub emulator
---

# Update Pub/Sub Emulator

1.  **Update Local Emulator**
    Run the following command to make sure you have the latest version of the pubsub emulator installed via gcloud:
    ```bash
    gcloud components update pubsub-emulator
    ```

2.  **Locate Emulator Directory**
    The emulator represents a directory likely located at `<gcloud-install-path>/platform/pubsub-emulator`.
    You can find the exact path by running the emulator and checking the output, or by inspecting where `gcloud` is installed (e.g. `which gcloud` usually points to a bin directory, and the platform directory is a sibling of `bin`).
    Verify the version by running the emulator or checking the `VERSION` file if it exists.

3.  **Package the Emulator**
    Zip the directory found in the previous step. Name it `pubsub-emulator-<version>.zip`.
    Ensure the zip structure is such that the top-level directory inside the zip is `pubsub-emulator`.
    *Note: The existing code expects the binary at `pubsub-emulator-<version>/pubsub-emulator/bin/cloud-pubsub-emulator` inside the cache, which usually means the zip contains a root folder `pubsub-emulator`.*

4.  **Upload to Storage**
    Upload the zip file to the Firebase preview bucket:
    ```bash
    gsutil cp pubsub-emulator-<version>.zip gs://firebase-preview-drop/emulator/
    ```
    Make the file publicly readable if necessary (usually the bucket permissions handle this, or use `gsutil acl ch -u AllUsers:R ...`).

    **Note:** For the version 0.8.27 update, this step was already done.

5.  **Calculate Metadata**
    Calculate the file size in bytes, MD5 checksum, and SHA256 checksum of the zip file.
    ```bash
    # Size
    ls -l pubsub-emulator-<version>.zip
    
    # MD5 (macOS)
    md5 pubsub-emulator-<version>.zip
    
    # SHA256 (macOS)
    shasum -a 256 pubsub-emulator-<version>.zip
    ```

6.  **Update Configuration**
    Edit `src/emulator/downloadableEmulatorInfo.json`:
    - Update `pubsub.version` to the new version.
    - Update `pubsub.expectedSize`.
    - Update `pubsub.expectedChecksum` (MD5).
    - Update `pubsub.expectedChecksumSHA256`.
    - Update `pubsub.remoteUrl` and `pubsub.downloadPathRelativeToCacheDir`.

7.  **Verify**
    Run the emulators to ensure the new version is downloaded and starts correctly.
    ```bash
    firebase emulators:start --only pubsub
    ```

8. **Add a Changelog Entry**
    Add a changelog entry to `CHANGELOG.md` like '- Updated Pub/Sub emulator to version <version>'
    