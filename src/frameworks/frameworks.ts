import * as angular from "./angular";
import * as astro from "./astro";
import * as express from "./express";
import * as lit from "./lit";
import * as next from "./next";
import * as nuxt from "./nuxt";
import * as nuxt2 from "./nuxt2";
import * as preact from "./preact";
import * as svelte from "./svelte";
import * as svelekit from "./sveltekit";
import * as react from "./react";
import * as vite from "./vite";
import * as flutter from "./flutter";

import { Framework } from "./interfaces";

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
