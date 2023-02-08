import React from "react";
import styles from "./Spacer.scss";

type SpacerSize =
  | "xsmall"
  | "small"
  | "medium"
  | "large"
  | "xlarge"
  | "xxlarge";

export function Spacer({ size = "large" }: { size: SpacerSize }) {
  return <div className={styles[`spacer${size}`]} />;
}
