import React from "react";
import { broker } from "./globals/html-broker";

export function FirematExecutionArgumentsApp() {
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    broker.send("definedFirematArgs", e.target.value);
  };

  return (
    <>
      <textarea onChange={handleInput}>{"{}"}</textarea>
    </>
  );
}
