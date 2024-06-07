## Setting up the repository

We use `npm` as package manager.  
Run `npm i` in both the parent folder and this folder:

```sh
cd ..
npm i
cd firebase-vscode
npm i
```

## Running tests

### Unit tests

Unit tests are located in `src/test/suite`.
The path to the test file should match the path to the source file. For example: `src/core/index.ts` should have its test located at `src/test/suite/core/index.test.ts`

They can be run with `npm run test:unit`.

#### Mocking dependencies inside unit tests

There is currently no support for stubbing imports.

If you wish to mock a functionality for a given test, you will need to introduce a layer of indirection for that feature. Then, your tests
would be able to replace the implementation with a different one.

For instance, say you wanted to mock `vscode.workspace`:
Instead of using `vscode.workspace` directly in the extension, you could
create an object that encapsulate `vscode.workspace`:

```ts
export const workspace = {
  value: vscode.workspace,
};
```

You would then use `workspace.value` in the extension. And then,
when it comes to writing your test, you'd be able to change `workspace.value`:

```ts
it("description", () => {
  workspace.value =
    /* whatever */
    /* Now run the code you want to test */
    assert.equal(something, somethingElse);

  /* Now reset the value back to normal */
  workspace.value = vscode.workspace;
});
```

Of course, doing this by hand is error prone. It's easy to forget to reset
a value back to normal.

To help with that, some testing utilities were made.
Using them, your test would instead look like:

```ts
// A wrapper around `it`
firebaseTest("description", () => {
  mock(workspace /* whatever */);

  /* Now run the code you want to test */
  assert.equal(something, somethingElse);

  /* No need to reset values. `mock` automatically handles this. */
});
```

### Integration tests

E2e tests can be found at `src/test/integration`.  
To run them, use:

```sh
npm run test:e2e
```
