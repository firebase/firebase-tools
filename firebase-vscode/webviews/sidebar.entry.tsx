import React from "react";
import { createRoot } from "react-dom/client";
import { SidebarApp } from "./SidebarApp";
import { App } from "./globals/app";

const root = createRoot(document.getElementById("root")!);
root.render(
  <App>
    <SidebarApp />
  </App>
);
