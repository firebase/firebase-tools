import React from "react";
import { createRoot } from "react-dom/client";
import { SidebarApp } from "./SidebarApp";
import { App } from "./globals/app";
import style from "./fdc_sidebar.entry.scss";

// Prevent scss tree shaking
style;

const root = createRoot(document.getElementById("root")!);
root.render(
  <App>
    <SidebarApp />
  </App>,
);
