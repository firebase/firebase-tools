- Added `appcheck` commands (preview) to manage Firebase App Check from the CLI: per-service
  enforcement (`appcheck:services:list|get|set`), attestation providers
  (`appcheck:providers:list|get|set`), debug tokens (`appcheck:debug:create|list|delete`), and
  `appcheck:apps:list`.
- Fixed an issue in `apps:create` where App Store ID was always prompted for even when unnecessary.
- Add `functions:lifecycle:list` and `functions:lifecycle:run` commands to view and run
  lifecycle hooks in isolation.
