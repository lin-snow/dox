import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

/**
 * Everything the floating cards need to behave like real dialogs. Kept in one
 * place so the five of them cannot drift: a dialog that forgets to restore
 * focus strands a keyboard user at the top of the document, which is exactly
 * the kind of bug nobody notices with a mouse.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Tab order candidates that a sighted user can actually reach. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (item) => item.tabIndex >= 0 && item.getClientRects().length > 0,
  );
}

export interface DialogHandlers<T extends HTMLElement> {
  ref: RefObject<T | null>;
  /** Wrap Tab at both ends; safe to call alongside an Escape handler. */
  onKeyDown: (event: ReactKeyboardEvent<T>) => void;
}

export function useDialog<
  T extends HTMLElement = HTMLDivElement,
>(): DialogHandlers<T> {
  const ref = useRef<T | null>(null);
  /**
   * Captured during render, not in an effect: `autoFocus` and the composer's
   * title input both run before effects, so anything measured later would be
   * the dialog itself and focus would have nowhere to go back to.
   */
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!root.contains(document.activeElement)) {
      (focusables(root)[0] ?? root).focus();
    }
    return () => {
      // The trigger can be gone (a deleted row, a closed column): never focus
      // a detached node, or focus lands back on <body>.
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<T>) => {
    if (event.key !== "Tab") return;
    const root = ref.current;
    if (!root) return;
    const items = focusables(root);
    if (items.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    const outside = !root.contains(active);
    if (event.shiftKey && (active === first || active === root || outside)) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return { ref, onKeyDown };
}
