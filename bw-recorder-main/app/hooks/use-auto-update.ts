import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

interface UseAutoUpdateOptions {
  enabled?: boolean;
  interval?: number;
}

type UpdateMode = "polling" | "disabled";

export const useAutoUpdate = (options: UseAutoUpdateOptions = {}) => {
  const { enabled = true, interval = 30000 } = options;

  const revalidator = useRevalidator();
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [mode, setMode] = useState<UpdateMode>("disabled");

  // Use ref to control polling interval
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      setMode("disabled");
      return;
    }

    const cleanup = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const setupPolling = () => {
      if (!isMountedRef.current) return;
      setMode("polling");
      intervalRef.current = setInterval(() => {
        if (!isMountedRef.current) return;
        revalidator.revalidate();
        setLastUpdate(new Date().toISOString());
      }, interval);
    };

    setupPolling();
    return cleanup;
  }, [enabled, interval, revalidator]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    mode,
    lastUpdate,
    retryCount: 0,
    isConnected: false,
  };
};
