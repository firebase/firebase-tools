import { Request } from "express";

/** Returns the body of a {@link Request} as a {@link Buffer}.  */
export async function reqBodyToBuffer(req: Request): Promise<Buffer> {
  if (req.body instanceof Buffer) {
    return Buffer.from(req.body);
  }
  const bufs: Buffer[] = [];
  req.on("data", (data) => {
    bufs.push(data);
  });
  await new Promise<void>((resolve) => {
    req.on("end", () => {
      resolve();
    });
  });
  return Buffer.concat(bufs);
}
