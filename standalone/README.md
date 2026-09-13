# Firepit Standalone Executable Builder

Firepit packages `firebase-tools` into a Single Executable Application (SEA)
using Node.js 26 native `--build-sea` capabilities.

## Prerequisites

- **Node.js 26.0.0+** installed (required for native `--build-sea`).
- **macOS / Linux / Windows** operating system.
- **Xcode Command Line Tools** (macOS only, for `codesign` and `lipo`).

## Quick Start (Local Development)

To build a standalone executable for your current architecture:

```bash
# Ensure Node 26 is active
nvm use 26

# Build the executable
npm run build:sea

# Run the binary
./dist/firepit-darwin-arm64 --version
```

If Node 26 is not your default active Node version, set `NODE_BIN`:

```bash
NODE_BIN=/path/to/node26/bin/node node build-sea.js
```

## Architecture & Cross-Compilation

Firepit builds native Single Executable Applications for `arm64` and `x64`
architectures.

### Building `arm64` Binaries (Apple Silicon)

Run the build using an `arm64` Node 26 runtime:

```bash
NODE_BIN=/Users/$USER/.nvm/versions/node/v26.6.0/bin/node \
  node build-sea.js
```

Output: `dist/firepit-darwin-arm64`

### Building `x64` Binaries (Intel / Rosetta)

Run the build using an `x64` Node 26 runtime:

```bash
NODE_BIN=/Users/$USER/.nvm/versions/node/v26.6.0-x64/bin/node \
  node build-sea.js
```

Output: `dist/firepit-darwin-x64`

## Creating Universal Binaries (macOS Universal 2)

To combine `arm64` and `x64` macOS executables into a single Universal 2
binary using Apple's `lipo` utility:

```bash
# 1. Combine binaries with lipo
lipo -create -output dist/firebase-tools-darwin-universal \
  dist/firepit-darwin-arm64 \
  dist/firepit-darwin-x64

# 2. Re-sign the universal binary with ad-hoc signature
codesign --sign - --force dist/firebase-tools-darwin-universal

# 3. Test execution
./dist/firebase-tools-darwin-universal --version
```

Verify architecture support with `file`:

```bash
file dist/firebase-tools-darwin-universal
```

Expected output:
`dist/firebase-tools-darwin-universal:`
`  Mach-O universal binary with 2 architectures`

## Production Release Pipeline

To build official release tarballs and headless binaries end-to-end:

```bash
cd ../scripts/firepit-builder
NODE_BIN=/path/to/node26/bin/node node ./pipeline.js \
  --package="/path/to/firebase-tools"
```

Artifacts are output to `/tmp/firepit_artifacts/`.
