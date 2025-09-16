"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reqBodyToBuffer = void 0;
/** Returns the body of a {@link Request} as a {@link Buffer}.  */
async function reqBodyToBuffer(req) {
    if (req.body instanceof Buffer) {
        return Buffer.from(req.body);
    }
    const bufs = [];
    req.on("data", (data) => {
        bufs.push(data);
    });
    await new Promise((resolve) => {
        req.on("end", () => {
            resolve();
        });
    });
    return Buffer.concat(bufs);
}
exports.reqBodyToBuffer = reqBodyToBuffer;
