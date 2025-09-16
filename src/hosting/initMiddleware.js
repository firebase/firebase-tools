"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initMiddleware = void 0;
const apiv2_1 = require("../apiv2");
const logger_1 = require("../logger");
const utils = __importStar(require("../utils"));
const SDK_PATH_REGEXP = /^\/__\/firebase\/([^/]+)\/([^/]+)$/;
/**
 * Initialize server middleware. Returns a middleware set up to provide the
 * javascript and json objects at the well-known paths.
 * @param init template server response.
 * @return the middleware function.
 */
function initMiddleware(init) {
    return (req, res, next) => {
        const parsedUrl = new URL(req.url || "", `http://${req.headers.host}`);
        const match = RegExp(SDK_PATH_REGEXP).exec(parsedUrl.pathname);
        if (match) {
            const version = match[1];
            const sdkName = match[2];
            const u = new URL(`https://www.gstatic.com/firebasejs/${version}/${sdkName}`);
            const c = new apiv2_1.Client({ urlPrefix: u.origin, auth: false });
            const headers = {};
            const acceptEncoding = req.headers["accept-encoding"];
            if (typeof acceptEncoding === "string" && acceptEncoding) {
                headers["accept-encoding"] = acceptEncoding;
            }
            c.request({
                method: "GET",
                path: u.pathname,
                headers,
                responseType: "stream",
                resolveOnHTTPError: true,
                compress: false,
            })
                .then((sdkRes) => {
                if (sdkRes.status === 404) {
                    return next();
                }
                for (const [key, value] of Object.entries(sdkRes.response.headers.raw())) {
                    res.setHeader(key, value);
                }
                sdkRes.body.pipe(res);
            })
                .catch((e) => {
                utils.logLabeledWarning("hosting", `Could not load Firebase SDK ${sdkName} v${version}, check your internet connection.`);
                logger_1.logger.debug(e);
            });
        }
        else if (parsedUrl.pathname === "/__/firebase/init.js") {
            // In theory we should be able to get this from req.query but for some
            // when testing this functionality, req.query and req.params were always
            // empty or undefined.
            const query = parsedUrl.searchParams;
            res.setHeader("Content-Type", "application/javascript");
            if (query.get("useEmulator") === "true") {
                res.end(init.emulatorsJs);
            }
            else {
                res.end(init.js);
            }
        }
        else if (parsedUrl.pathname === "/__/firebase/init.json") {
            res.setHeader("Content-Type", "application/json");
            res.end(init.json);
        }
        else {
            next();
        }
    };
}
exports.initMiddleware = initMiddleware;
//# sourceMappingURL=initMiddleware.js.map