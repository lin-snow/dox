/**
 * Server-sent events from the Go backend: reminder taps, tray "open", and
 * session changes. SSE keeps the transport HTTP-only, so the UI has no Wails
 * imports and runs identically in a browser during verification.
 */
export type AppEvent =
  | { type: "open"; todoId: string }
  | { type: "reminder"; todoId: string; title: string }
  | { type: "session" };

export function subscribe(onEvent: (event: AppEvent) => void): () => void {
  const source = new EventSource("/__dox/events");
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as AppEvent);
    } catch {
      /* ignore malformed frames; the stream stays open */
    }
  };
  return () => source.close();
}
