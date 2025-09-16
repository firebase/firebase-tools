"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const metaprogramming_1 = require("../metaprogramming");
// This line caues a compile-time error if HostingOptions has a field that is
// missing in Options or incompatible with the type in Options.
(0, metaprogramming_1.assertImplements)();
//# sourceMappingURL=options.js.map