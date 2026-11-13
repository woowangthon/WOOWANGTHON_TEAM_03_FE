import { useEffect, useRef, useState } from "react";

const narrowViewport = "(max-width: 839px)";
const focusableSelector =
  "a[href], button, input, select, textarea, [tabindex]";

function drawerPortals(container) {
  return [
    ...container.querySelectorAll('[aria-expanded="true"][aria-controls]'),
  ]
    .map((trigger) =>
      document.getElementById(trigger.getAttribute("aria-controls")),
    )
    .filter((panel) => panel && !container.contains(panel));
}

function focusableElements(container) {
  return [container, ...drawerPortals(container)]
    .flatMap((root) => [...root.querySelectorAll(focusableSelector)])
    .filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        element.getClientRects().length > 0,
    );
}

export default function useNavigationDrawer() {
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia(narrowViewport).matches,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef(null);
  const menuButtonRef = useRef(null);
  const modalOpen = isNarrow && menuOpen;

  useEffect(() => {
    const query = window.matchMedia(narrowViewport);
    function updateViewport() {
      setIsNarrow(query.matches);
      if (!query.matches) setMenuOpen(false);
    }
    updateViewport();
    query.addEventListener("change", updateViewport);
    return () => query.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const sidebar = sidebarRef.current;
    const trigger = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function focusFirst() {
      (focusableElements(sidebar)[0] || sidebar).focus({ preventScroll: true });
    }
    function containFocus(event) {
      if (
        !sidebar.contains(event.target) &&
        !drawerPortals(sidebar).some((panel) => panel.contains(event.target))
      )
        focusFirst();
    }
    function handleKey(event) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(sidebar);
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) {
        event.preventDefault();
        sidebar.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    focusFirst();
    document.addEventListener("keydown", handleKey);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
      if (!sidebar.isConnected) return;
      if (trigger?.isConnected && trigger.getClientRects().length) {
        trigger.focus({ preventScroll: true });
      } else if (!sidebar.contains(document.activeElement)) {
        // At desktop widths the trigger disappears; keep focus in the visible nav.
        focusFirst();
      }
    };
  }, [modalOpen]);

  return {
    isNarrow,
    menuOpen,
    setMenuOpen,
    modalOpen,
    sidebarRef,
    menuButtonRef,
  };
}
