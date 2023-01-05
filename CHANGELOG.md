- Fixes a bug in the pubsub emulator by forcing a shutdown if it didn't end cleanly. (#5294)
- Fixes an issue where dependencies for emulated Extensions would not be installed on Windows - thanks @stfsy! (#5372)
- Adds emulator support for Extensions with schedule triggers - thanks @stsfy! (#5374)
  <<<<<<< HEAD
- Fixes an issue in the Functions emulator where secret values were undefined after hot reload with the `--inspect-functions` flag. (#5384)
- Fixes a bug where functions:delete command did not recognize '-' as delimiter. (#5290)
- Reintroduces an updated Hosting emulator with i18n (#4879) and Windows path (#5133) fixes.
- Upgrade Storage Rules Runtime to v2.0.0 (Java 11)
