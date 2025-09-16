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
exports.prettifyTable = exports.prettify = void 0;
const Table = __importStar(require("cli-table3"));
function prettify(err) {
    let message = err.message;
    let header = err.extensions?.file ?? "";
    if (err.locations && err.locations.length) {
        const line = err.locations[0]?.line ?? "";
        if (line) {
            header += `:${line}`;
        }
    }
    if (err.path && err.path.length) {
        let pathStr = "On ";
        for (let i = 0; i < err.path.length; i++) {
            if (typeof err.path[i] === "string") {
                if (i === 0) {
                    pathStr += err.path[i];
                }
                else {
                    pathStr = `${pathStr}.${err.path[i]}`;
                }
            }
            else {
                pathStr = `${pathStr}[${err.path[i]}]`;
            }
        }
        message = `${pathStr}: ${message}`;
    }
    return header.length ? `${header}: ${message}` : message;
}
exports.prettify = prettify;
function splitIssueMessage(err) {
    const msg = err.message.split(": ");
    if (msg.length >= 2) {
        return [msg[0], msg.slice(1).join(":")];
    }
    return ["", err.message];
}
function prettifyTable(errs) {
    const table = new Table({
        head: ["Type", "Issue", "Workaround", "Reason"],
        style: { head: ["yellow"] },
        colWidths: [20, 50, 50, 50],
        wordWrap: true,
    });
    // We want to present BREAKING before INSECURE changes. Ordering of other issues matters less, but we want to keep categories grouped together.
    errs.sort((a, b) => a.message.localeCompare(b.message));
    for (const e of errs) {
        const msg = splitIssueMessage(e);
        e.message = msg[1];
        if (!e.extensions?.workarounds?.length) {
            table.push([msg[0], prettify(e), "", ""]);
        }
        else {
            const workarounds = e.extensions.workarounds;
            for (let i = 0; i < workarounds.length; i++) {
                if (i === 0) {
                    table.push([msg[0], prettify(e), workarounds[i].description, workarounds[i].reason]);
                }
                else {
                    table.push(["", "", workarounds[i].description, workarounds[i].reason]);
                }
            }
        }
    }
    return table.toString();
}
exports.prettifyTable = prettifyTable;
//# sourceMappingURL=graphqlError.js.map