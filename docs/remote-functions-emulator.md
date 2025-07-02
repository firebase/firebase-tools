# Remote Functions Emulator Support Plan

## Overview
This document outlines the plan to add emulator support for remote function sources. This will be implemented as a separate feature branch after the deployment support is complete.

## Current State (Deployment Support)
The following changes have been made to support remote function deployment:

### 1. Configuration Types
- Added `RemoteSource` type to `firebaseConfig.ts`
- Updated `FunctionConfig` to include optional `remoteSource` field
- Remote source structure: `{ repo: string, ref: string, path?: string }`

### 2. Validation
- Added `validateRemoteSource()` in `projectConfig.ts`
- Validates GitHub HTTPS URLs only
- Validates ref format (branch, tag, or commit SHA)
- Validates optional path (no `..`, no absolute paths, no trailing `/`)

### 3. Remote Source Handling
- Created `remoteSource.ts` with download and extraction logic
- Downloads GitHub archives (e.g., `https://github.com/owner/repo/archive/ref.zip`)
- Extracts to temporary directory
- Validates `functions.yaml` presence (security requirement)
- Supports subdirectory navigation with `path` option

### 4. Deployment Integration
- Modified `prepare.ts` to handle remote sources in `loadCodebases()`
- Downloads remote source before building
- Uses temporary directories (auto-cleaned by OS)
- Passes source directory to runtime delegate

### 5. Environment Variables
- Extended `UserEnvsOpts` to include `codebase` and `isRemoteSource`
- Loads `.env.<codebase>` and `.env.<codebase>.<projectId>` from project root
- Allows environment configuration for remote sources

## Emulator Support Plan

### Architecture Decision
Instead of reusing the extensions emulator codepath (which assumes fixed directory structure), implement dedicated remote functions support with selective code sharing.

### Key Differences from Extensions
1. **Directory Structure**: Functions.yaml lives next to package.json, not at repo root
2. **Multiple Codebases**: A repo can have multiple function codebases
3. **No Fixed Structure**: Each codebase is self-contained

### Implementation Plan

#### Phase 1: Core Infrastructure

**1. Create Emulator-Specific Remote Source Handler**
```typescript
// src/emulator/functions/remoteSource.ts
export interface EmulatorRemoteSourceCache {
  getCachedSource(remoteSource: RemoteSourceConfig): string | null;
  cacheSource(remoteSource: RemoteSourceConfig, sourcePath: string): void;
  clearCache(): void;
}

export async function resolveRemoteSource(
  remoteSource: RemoteSourceConfig,
  codebase: string,
  cache: EmulatorRemoteSourceCache
): Promise<string> {
  // Check cache first
  // Download if not cached
  // Validate functions.yaml
  // Return source directory path
}
```

**2. Cache Management**
- Cache location: `~/.cache/firebase/functions/{repo-hash}/{ref}/{path-hash}/`
- Environment variable: `FIREBASE_FUNCTIONS_CACHE_PATH` to override
- Cache invalidation on ref change
- Support `--clear-cache` flag

#### Phase 2: Emulator Integration

**1. Modify Functions Emulator Loading**
```typescript
// In functionsEmulator.ts - loadCodebases() or equivalent
for (const codebase of codebases) {
  const codebaseConfig = configForCodebase(config, codebase);
  let sourceDir: string;
  
  if (codebaseConfig.remoteSource) {
    // Resolve remote source for emulator
    sourceDir = await resolveRemoteSource(
      codebaseConfig.remoteSource,
      codebase,
      this.remoteSourceCache
    );
  } else {
    sourceDir = codebaseConfig.source;
  }
  
  // Continue with normal emulator flow
}
```

**2. Environment Variable Support**
- Load `.env.<codebase>` files from project root
- Support hot-reloading when env files change
- Pass environment variables to emulated functions

**3. Watch Mode Considerations**
- Remote sources are immutable (tied to specific ref)
- Only watch local `.env.<codebase>` files for changes
- Optionally support `--watch-remote` flag to periodically check for ref updates

#### Phase 3: Developer Experience

**1. Logging and Feedback**
- Clear messages when downloading remote sources
- Cache hit/miss information
- Progress indicators for large downloads

**2. Error Handling**
- Network failures with retry logic
- Invalid repository access
- Missing functions.yaml with helpful error messages

**3. Performance Optimizations**
- Parallel downloads for multiple remote sources
- Persistent cache across emulator restarts
- Option to pre-download sources before starting emulator

### Testing Strategy

1. **Unit Tests**
   - Cache management logic
   - Remote source resolution
   - Environment variable loading

2. **Integration Tests**
   - Emulator with single remote source
   - Emulator with mixed local and remote sources
   - Cache invalidation scenarios
   - Environment variable overrides

3. **E2E Tests**
   - Full emulator flow with remote functions
   - Hot reload of env files
   - Error scenarios (network failure, invalid sources)

### Code Sharing Opportunities

From extensions emulator, we can reuse:
- Download utilities (`downloadUtils.ts`)
- Progress reporting
- Archive extraction logic
- Some caching patterns

### Migration Path

1. Users with existing `firebase.json` files continue to work unchanged
2. Adding `remoteSource` to functions config enables the feature
3. Emulator automatically handles remote sources when detected
4. Clear documentation on functions.yaml requirements

### Security Considerations

1. **Validation**: Always require functions.yaml in remote sources
2. **No Code Execution**: Don't run npm install or build commands
3. **Network**: Only support HTTPS GitHub URLs
4. **Path Traversal**: Validate paths to prevent directory escape

### Future Enhancements

1. **Private Repository Support**: Add authentication options
2. **Other Providers**: GitLab, Bitbucket support
3. **Version Locking**: Lock to specific versions in functions.yaml
4. **Dependency Caching**: Cache node_modules for faster startup

## Summary

This plan provides emulator support for remote functions that:
- Respects the functions architecture (functions.yaml next to package.json)
- Supports multiple codebases from the same repository
- Provides good developer experience with caching and clear feedback
- Maintains security through validation requirements
- Shares code with extensions where appropriate without compromising architecture