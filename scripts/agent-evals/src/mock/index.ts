import {Module} from 'module';
import path from 'path';
import {getFirebaseCliRoot} from '../runner/paths.js';

const TOOLS_PATH = 'lib/mcp/tools/';
const MCP_INDEX_PATH = 'lib/mcp/tools/';

const originalRequire = Module.prototype.require;

Module.prototype.require = function(id: string) {
  const requiredModule = originalRequire.apply(this, [id]);

  // The module doing the importing
  const parentModule = this;
  const absolutePath = Module.createRequire(parentModule.filename).resolve(id);
  const pathRelativeToCliRoot = path.relative(getFirebaseCliRoot(), absolutePath);
  // if (pathRelativeToCliRoot.startsWith(TOOLS_PATH)) {
  //   const toolPath = pathRelativeToCliRoot.replace(TOOLS_PATH, "");
  //   console.log({
  //     path: toolPath,
  //     module: JSON.stringify(requiredModule),
  //   });
  // }
  if ((requiredModule as any)?.FirebaseMcpServer) {
    const toolPath = pathRelativeToCliRoot.replace(MCP_INDEX_PATH, "");
    console.log({
      path: toolPath,
      pathRelativeToCliRoot: pathRelativeToCliRoot,
      module: JSON.stringify(requiredModule),
      MCPMod: JSON.stringify((requiredModule as any)?.FirebaseMcpServer),
    });
  }
  // if (pathRelativeToCliRoot.startsWith(MCP_INDEX_PATH)) {
  //   const toolPath = pathRelativeToCliRoot.replace(MCP_INDEX_PATH, "");
  //   console.log({
  //     path: toolPath,
  //     pathRelativeToCliRoot: pathRelativeToCliRoot,
  //     module: JSON.stringify(requiredModule),
  //   });
  // }
  return requiredModule;
};
