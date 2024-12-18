import * as angular from "./angular/index.js";
import * as astro from "./astro/index.js";
import * as express from "./express/index.js";
import * as lit from "./lit/index.js";
import * as next from "./next/index.js";
import * as nuxt from "./nuxt/index.js";
import * as nuxt2 from "./nuxt2/index.js";
import * as preact from "./preact/index.js";
import * as svelte from "./svelte/index.js";
import * as svelekit from "./sveltekit/index.js";
import * as react from "./react/index.js";
import * as vite from "./vite/index.js";
import * as flutter from "./flutter/index.js";

import { Framework } from "./interfaces.js";

export const WebFrameworks: Record<string, Framework> = {
  angular,
  astro,
  express,
  lit,
  next,
  nuxt,
  nuxt2,
  preact,
  svelte,
  svelekit,
  react,
  vite,
  flutter,
};
