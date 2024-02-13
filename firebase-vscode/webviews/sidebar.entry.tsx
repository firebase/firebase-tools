import React from "react";
import { createRoot } from "react-dom/client";
import { SidebarApp } from "./SidebarApp";
import { App } from "./globals/app";
import { EmulatorProvider } from "./components/EmulatorPanel";

const root = createRoot(document.getElementById("root")!);
root.render(
  <App>
    <EmulatorProvider>
      <SidebarApp />
    </EmulatorProvider>
  </App>
);
