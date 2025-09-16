"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prettifyTable = exports.prettify = void 0;
const Table = require("cli-table3");
function prettify(err) {
    var _a, _b, _c, _d;
    let message = err.message;
    let header = (_b = (_a = err.extensions) === null || _a === void 0 ? void 0 : _a.file) !== null && _b !== void 0 ? _b : "";
    if (err.locations && err.locations.length) {
        const line = (_d = (_c = err.locations[0]) === null || _c === void 0 ? void 0 : _c.line) !== null && _d !== void 0 ? _d : "";
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
    var _a, _b;
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
        if (!((_b = (_a = e.extensions) === null || _a === void 0 ? void 0 : _a.workarounds) === null || _b === void 0 ? void 0 : _b.length)) {
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
