# Discovery

This is a quick prototype to test out the data-driven models that could be used
for discovery by both the turtle team and the mono team. The turtle team would
hypothetically interleave both these Strategies with their own Builder, even
within the same lifecycle. For example:

```
const strategy = await detect(new RealFileSystem(process.cwd));
const builder = new builders[strategy.frameworkName](process.cwd);

if (strategy.packageManagerInstallCommand()) {
  process.execSync(strategy.pacakageManagerInstallCommand());
}
builder.performCodeInjection()

if (strategy.installCommand()) {
  process.execSync(strategy.installCommand());
}
if (strategy.buildCommand()) {
  process.execSync(strategy.buildCommand());
}
const config = await builder.detectConfig();
const image = builder.createImage();
builder.createRelease(image, config);
```

In this case, strategies are a combination of a thick Runtime and a series of
Framework files. Runtimes will be heavily specified and firebase-tools will
serve as a reference implementation. Framework definitions will be shared in
all engines.

TODO: Figure out Vite. Does Node need to know Vite? Should Vite be a Runtime?
TODO: Figure out local vs global typescript, vite, etc.
