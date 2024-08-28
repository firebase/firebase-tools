/** An utility to find a Webview with a given name.
 *
 * This uses a nested loop because the webviews are nested in iframes.
 *
 * Returns the path of elements pointing to the titled webview.
 * This is typically then sent to [runInFrame].
 */
export async function runWebviewWithTitle(
  title: string,
  cb: (frame: object) => Promise<void>,
) {
  const start = Date.now();

  /* Keep running until at least 5 seconds have passed. */
  while (Date.now() - start < 5000) {
    // Using Array.from because $$ returns a fake array object
    const iFrames = Array.from(await $$("iframe.webview.ready"));

    for (const iframe of iFrames) {
      const didRun = await runInFrame(iframe, async () => {
        const frameWithTitle = await $(`iframe[title="${title}"]`);
        if ((await frameWithTitle.isExisting()) && !frameWithTitle.error) {
          await runInFrame(frameWithTitle, () => cb(frameWithTitle));
          return true;
        }

        return false;
      });

      if (didRun) {
        return;
      }
    }
  }

  throw new Error(`Could not find webview with title: ${title}`);
}

export async function runInFrame<R>(
  element: object,
  cb: () => Promise<R>,
): Promise<R> {
  await browser.switchToFrame(element);

  // Using try/finally to ensure we switch back to the parent frame
  // no matter if the test passes or fails.
  try {
    return await cb();
  } finally {
    await browser.switchToParentFrame();
  }
}
