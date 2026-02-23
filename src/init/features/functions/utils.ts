export function templateWithSubbedResolverId(resolverId: string, template: string): string {
  let replaced = template;
  const resolverIdWithUnderscores = resolverId.replaceAll("-", "_");
  replaced = replaced.replace("__resolverId__", resolverId);
  replaced = replaced.replace("__resolverIdWithUnderscores__", resolverIdWithUnderscores);
  return replaced;
}
