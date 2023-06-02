import cn from "classnames";
import React, { HTMLAttributes, PropsWithChildren } from "react";
import styles from "./Text.scss";

type TextProps<T> = PropsWithChildren<
  T &
    HTMLAttributes<HTMLElement> & {
      secondary?: boolean;
      as?: any;
    }
>;

const Text: React.FC<TextProps<{}>> = ({
  secondary,
  as: Component = "div",
  className,
  ...props
}) => {
  return (
    <Component
      className={cn(secondary ? [styles.colorSecondary] : undefined, className)}
      {...props}
    />
  );
};

export const Heading: React.FC<TextProps<{ level: 1 | 2 | 3 | 4 | 5 | 6 }>> = ({
  level = 1,
  ...props
}) => {
  return <Text as={`h${level}`} {...props} />;
};

export const Label: React.FC<TextProps<{ level?: 1 | 2 | 3 | 4 }>> = ({
  level = 1,
  className,
  ...props
}) => {
  return (
    <Text
      className={cn(className, styles.text, styles[`l${level}`])}
      {...props}
    />
  );
};

export const Body: React.FC<TextProps<{ level?: 1 | 2 }>> = ({
  level = 1,
  className,
  ...props
}) => {
  return (
    <Text
      className={cn(className, styles.text, styles[`b${level}`])}
      {...props}
    />
  );
};
