import { useEffect, useState } from "react";

/**
 * Custom hook to check if we're running on the client side.
 * This helps prevent hydration mismatches by ensuring components
 * render consistently on server and client until hydration is complete.
 */
export function useIsClient() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}
