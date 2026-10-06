import { useEffect } from "react";
import { useRevalidator } from "react-router";

export const useRevalidateOnFocus = ({
  enabled = false,
}: {
  enabled?: boolean;
}) => {
  let revalidator = useRevalidator();

  useEffect(
    function revalidateOnFocus() {
      if (!enabled) return;
      function onFocus() {
        revalidator.revalidate();
      }
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revalidator.revalidate]
  );

  useEffect(
    function revalidateOnVisibilityChange() {
      if (!enabled) return;
      function onVisibilityChange() {
        revalidator.revalidate();
      }
      window.addEventListener("visibilitychange", onVisibilityChange);
      return () =>
        window.removeEventListener("visibilitychange", onVisibilityChange);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revalidator.revalidate]
  );
};
