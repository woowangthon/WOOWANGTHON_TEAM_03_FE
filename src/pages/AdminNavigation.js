import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

// Keep scroll positions in memory only; filters and pagination live in the URL.
const positions = new Map();

export function useAdminScroll(ready = true) {
  const location = useLocation();
  const auth = useAuth();
  const key = `${auth.user.id}:${location.pathname}${location.search}`;
  const restored = useRef(null);
  useLayoutEffect(() => {
    if (!ready || restored.current === key) return;
    const saved = positions.get(key) ?? location.state?.adminScroll ?? 0;
    window.scrollTo({
      top: Number.isFinite(saved) ? saved : 0,
      behavior: "instant",
    });
    restored.current = key;
  }, [key, ready]);
  useEffect(() => {
    const save = () => {
      if (restored.current === key) positions.set(key, window.scrollY);
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [key]);
  return () => {
    positions.set(key, window.scrollY);
    // Only a numeric position enters history. No audit or account data is persisted.
    window.history.replaceState(
      {
        ...window.history.state,
        usr: { ...window.history.state?.usr, adminScroll: window.scrollY },
      },
      "",
    );
  };
}

export function useAdminBack(fallback) {
  const location = useLocation();
  const navigate = useNavigate();
  return () => {
    // Only traverse history for a transition made from the expected list.
    if (location.state?.adminReturn === fallback) navigate(-1);
    else navigate(fallback + location.search, { replace: true });
  };
}
