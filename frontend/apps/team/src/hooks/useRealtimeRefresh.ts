import { useEffect } from "react";

export function useRealtimeRefresh(refresh: () => void, interval = 3000) {
  useEffect(() => {
    const timer = window.setInterval(refresh, interval);
    return () => window.clearInterval(timer);
  }, [interval, refresh]);
}
