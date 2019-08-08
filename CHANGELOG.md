* Introduce experimental support for browser clients to the Firestore emulator.
* No longer require authentication to run the functions emulator.
* Add new project management commands: `projects:create`, `projects:list`,
  `projects:addFirebase`.
* Add new app management commands: `apps:create`, `apps:list`, `apps:sdkconfig`.
* Improve `init` command to be able to create a new project.
* Automatically choose a port for the Firestore emulator to serve WebChannel traffic.
* Deprecate `list` command.
