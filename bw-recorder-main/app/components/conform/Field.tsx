import { cn } from "../../lib/utils";

export const Field = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return <div className={cn("flex flex-col gap-2 mb-4", className)}>{children}</div>;
};

export const FieldError = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return <div className={cn("text-sm text-red-600", className)}>{children}</div>;
};

export const FieldFooter = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return <div className={cn("mt-6", className)}>{children}</div>;
};
