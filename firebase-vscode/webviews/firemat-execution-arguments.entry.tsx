import React from "react";
import { createRoot } from "react-dom/client";
import { FirematExecutionArgumentsApp } from "./FirematExecutionArgumentsApp";
import style from "./firemat-execution-arguments.entry.scss";

// Prevent webpack from removing the `style` import above
style;

const root = createRoot(document.getElementById("root")!);
root.render(<FirematExecutionArgumentsApp />);
