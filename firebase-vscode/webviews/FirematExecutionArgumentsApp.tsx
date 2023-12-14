import React from "react";
import { broker } from "./globals/html-broker";
import style from "./firemat-execution-arguments.entry.scss";

export function FirematExecutionArgumentsApp() {
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    broker.send("definedFirematArgs", e.target.value);
  };

  return (
    <>
      <textarea className={style.id} onChange={handleInput}>
        {"{}"}
      </textarea>
    </>
  );
}
