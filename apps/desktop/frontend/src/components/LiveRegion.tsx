import { useCallback, useRef, useState } from "react";

/**
 * One polite status region and one assertive alert region for the whole app.
 *
 * Why a live region rather than another toast: a toast is a visual change with
 * no announcement, and duplicating the message in both a toast and a region
 * makes screen readers say everything twice. So the visible `error` toast and
 * the `notice` string are the same state these regions render — one source,
 * one announcement.
 */
export function useAnnouncer() {
  const [status, setStatus] = useState("");
  const last = useRef("");

  const announce = useCallback((text: string) => {
    if (!text) {
      setStatus("");
      last.current = "";
      return;
    }
    if (last.current === text) {
      // Identical text is a no-op for a live region. Clear, then restate, so
      // a repeated action (saved twice) is still spoken twice.
      setStatus("");
      window.setTimeout(() => setStatus(text), 50);
    } else {
      setStatus(text);
    }
    last.current = text;
  }, []);

  return { status, announce };
}

export function LiveRegion({
  status,
  alert,
}: {
  status: string;
  alert: string;
}) {
  return (
    <>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status}
      </div>
      <div className="sr-only" role="alert" aria-atomic="true">
        {alert}
      </div>
    </>
  );
}
