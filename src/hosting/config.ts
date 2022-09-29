import { bold } from "colorette";
import { cloneDeep, logLabeledWarning } from "../utils";

import { FirebaseError } from "../error";
import { HostingMultiple, HostingSingle, FirebaseConfig, HostingResolved } from "../firebaseConfig";
import { Options } from "../options";
import { partition } from "../functional";
import { Implements, RequireAtLeastOne } from "../metaprogramming";
import { dirExistsSync } from "../fsutils";
import { resolveProjectPath } from "../projectPath";
import path from "path";

// TODO: Consider putting this type along with the Options type.
// I haven't tried to do this yet because true options embeds classes, not just
// interfaces.
// We should consider either refactoring options so it can be more easily mocked,
// or creating a utility for constructing options easily in tests.
export interface MockableOptions {
  project?: string;
  site?: string;
  config: {
    src: FirebaseConfig;
  };
  rc: {
    requireTarget(project: string, type: string, name: string): string[];
  };
  cwd?: string;
  configPath?: string;
  only?: string;
  except?: string;
  normalizedHostingConfig?: HostingMultiple & { site: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockableOptionsIsCompatibleWithOptions: Implements<Options, MockableOptions> = true;

// assertMatches allows us to throw when an --only flag doesn't match a target
// but an --except flag doesn't. Is this desirable behavior?
function matchingConfigs(
  configs: HostingMultiple,
  targets: string[],
  assertMatches: boolean
): HostingMultiple {
  const matches: HostingMultiple = [];
  const [hasSite, hasTarget] = partition(configs, (c) => "site" in c);
  for (const target of targets) {
    const siteMatch = hasSite.find((c) => c.site === target);
    const targetMatch = hasTarget.find((c) => c.target === target);
    if (siteMatch) {
      matches.push(siteMatch);
    } else if (targetMatch) {
      matches.push(targetMatch);
    } else if (assertMatches) {
      throw new FirebaseError(
        `Hosting site or target ${bold(target)} not detected in firebase.json`
      );
    }
  }
  return matches;
}

/**
 * Returns a subset of configs that match the only string
 */
export function filterOnly(configs: HostingMultiple, onlyString?: string): HostingMultiple {
  if (!onlyString) {
    return configs;
  }

  let onlyTargets = onlyString.split(",");
  // If an unqualified "hosting" is in the --only,
  // all hosting sites should be deployed.
  if (onlyTargets.includes("hosting")) {
    return configs;
  }

  // Strip out Hosting deploy targets from onlyTarget
  onlyTargets = onlyTargets
    .filter((target) => target.startsWith("hosting:"))
    .map((target) => target.replace("hosting:", ""));

  return matchingConfigs(configs, onlyTargets, /* assertMatch= */ true);
}

/**
 * Returns a subset of configs that match the except string;
 */
export function filterExcept(configs: HostingMultiple, exceptOption?: string): HostingMultiple {
  if (!exceptOption) {
    return configs;
  }

  const exceptTargets = exceptOption.split(",");
  if (exceptTargets.includes("hosting")) {
    return [];
  }

  const exceptValues = exceptTargets
    .filter((t) => t.startsWith("hosting:"))
    .map((t) => t.replace("hosting:", ""));
  const toReject = matchingConfigs(configs, exceptValues, /* assertMatch=*/ false);

  return configs.filter((c) => !toReject.find((r) => c.site === r.site && c.target === r.target));
}

/**
 * Verifies that input in firebase.json is sane
 * @param options options from the command library
 * @return a deep copy of validated configs
 */
export function extract(options: MockableOptions): HostingMultiple {
  const config = options.config.src;
  if (!config.hosting) {
    return [];
  }
  const assertOneTarget = (config: HostingSingle): void => {
    if (config.target && config.site) {
      throw new FirebaseError(
        `Hosting configs should only include either "site" or "target", not both.`
      );
    }
  };

  if (!Array.isArray(config.hosting)) {
    // Upgrade the type because we pinky swear to ensure site exists as a backup.
    const res = cloneDeep(config.hosting) as unknown as RequireAtLeastOne<{
      site: string;
      target: string;
    }>;
    // earlier the default RTDB instance was used as the hosting site
    // because it used to be created along with the Firebase project.
    // RTDB instance creation is now deferred and decoupled from project creation.
    // the fallback hosting site is now filled in through requireHostingSite.
    if (!res.target && !res.site) {
      // Fun fact. Site can be the empty string if someone just downloads code
      // and launches the emulator before configuring a project.
      res.site = options.site;
    }
    assertOneTarget(res);
    return [res];
  } else {
    config.hosting.forEach(assertOneTarget);
    return cloneDeep(config.hosting);
  }
}

/** Validates hosting configs for semantic correctness. */
export function validate(configs: HostingMultiple, options: MockableOptions): void {
  for (const config of configs) {
    validateOne(config, options);
  }
}

function validateOne(config: HostingMultiple[number], options: MockableOptions): void {
  // NOTE: a possible validation is to make sure site and target are not both
  // specified, but this expectation is broken after calling resolveTargets.
  // Thus that one validation is tucked into extract() where we know we haven't
  // resolved targets yet.

  const hasAnyStaticRewrites = !!config.rewrites?.find((rw) => "destination" in rw);
  const hasAnyDynamicRewrites = !!config.rewrites?.find((rw) => !("destination" in rw));
  const hasAnyRedirects = !!config.redirects?.length;

  if (!config.public && hasAnyStaticRewrites) {
    throw new FirebaseError('Must supply a "public" directory when using "destination" rewrites.');
  }

  if (!config.public && !hasAnyDynamicRewrites && !hasAnyRedirects) {
    throw new FirebaseError(
      'Must supply a "public" directory or at least one rewrite or redirect in each "hosting" config.'
    );
  }

  if (config.public && !dirExistsSync(resolveProjectPath(options, config.public))) {
    throw new FirebaseError(
      `Specified "public" directory "${
        config.public
      }" does not exist, can't deploy hosting to site "${config.site || config.target}"`
    );
  }

  // Using stupid types because type unions are painful sometimes
  const regionWithoutFunction = (rewrite: Record<string, unknown>): boolean =>
    typeof rewrite.region === "string" && typeof rewrite.function !== "string";
  const violation = config.rewrites?.find(regionWithoutFunction);
  if (violation) {
    throw new FirebaseError(
      "Rewrites only support 'region' as a top-level field when 'function' is set as a string"
    );
  }

  if (config.i18n) {
    if (!config.public) {
      throw new FirebaseError('Must supply a "public" directory when using "i18n" configuration.');
    }

    if (!config.i18n.root) {
      throw new FirebaseError('Must supply a "root" in "i18n" config.');
    }

    const i18nPath = path.join(config.public, config.i18n.root);
    if (!dirExistsSync(resolveProjectPath(options, i18nPath))) {
      logLabeledWarning(
        "hosting",
        `Couldn't find specified i18n root directory ${bold(
          config.i18n.root
        )} in public directory ${bold(config.public)}`
      );
    }
  }
}

/**
 * Converts all configs from having a target to having a soruce
 */
export function resolveTargets(
  configs: HostingMultiple,
  options: MockableOptions
): HostingResolved[] {
  return configs.map((config) => {
    const newConfig = cloneDeep(config);
    if (config.site) {
      return newConfig as HostingResolved;
    }
    if (!config.target) {
      throw new FirebaseError(
        "Assertion failed: resolving hosting target of a site with no site name " +
          "or target name. This should have caused an error earlier",
        { exit: 2 }
      );
    }
    const matchingTargets = options.rc.requireTarget(options.project!, "hosting", config.target);
    if (matchingTargets.length > 1) {
      throw new FirebaseError(
        `Hosting target ${bold(config.target)} is linked to multiple sites, ` +
          `but only one is permitted. ` +
          `To clear, run:\n\n  firebase target:clear hosting ${config.target}`
      );
    }
    newConfig.site = matchingTargets[0];
    return newConfig as HostingResolved;
  });
}

/**
 * Extract a validated normalized set of Hosting configs from the command options.
 * This also resolves targets, so it is not suitable for the emulator.
 */
export function hostingConfig(options: MockableOptions): HostingResolved[] {
  if (!options.normalizedHostingConfig) {
    let configs: HostingMultiple = extract(options);
    configs = filterOnly(configs, options.only);
    configs = filterExcept(configs, options.except);

    // N.B. We're calling resolveTargets after filterOnly/except, which means
    // we won't recognize a --only <site> when the config has a target.
    // This is the way I found this code and should bring up to others whether
    // we should change the behavior.
    const resolved = resolveTargets(configs, options);
    options.normalizedHostingConfig = resolved;
  }
  return options.normalizedHostingConfig;
}
