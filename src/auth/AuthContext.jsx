import { createContext, useContext, useEffect, useRef, useState } from "react";
import { authApi, authMode, clearRequestData } from "../api/services.js";
import { ApiError } from "../api/http.js";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(authMode === "real");
  const [error, setError] = useState("");
  const generation = useRef(0);
  function clearSession() {
    generation.current++;
    authApi.clear();
    clearRequestData();
    setSession(null);
  }
  async function restore() {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const restored = await authApi.bootstrap();
      if (version !== generation.current) return;
      setSession(restored);
      setLoading(false);
    } catch (error) {
      if (version !== generation.current) return;
      clearSession();
      if (error.code !== "AUTH_REQUIRED") setError(error.message);
      setLoading(false);
    }
  }
  useEffect(() => {
    if (authMode === "real") restore();
    return () => {
      generation.current++;
    };
    // Bootstrap runs once; a server error is never replaced by a mock session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!session?.session_expires_at) return;
    const delay = Date.parse(session.session_expires_at) - Date.now();
    const timer = setTimeout(
      () => {
        clearSession();
        setError("로그인이 만료됐습니다. 다시 로그인해 주세요.");
      },
      Math.max(0, delay),
    );
    return () => clearTimeout(timer);
  }, [session?.session_expires_at]);
  async function run(operation) {
    const version = generation.current;
    try {
      const result = await operation();
      if (version !== generation.current) {
        throw new ApiError(
          "SESSION_CHANGED",
          "로그인 계정이 변경됐습니다. 다시 확인해 주세요.",
        );
      }
      return result;
    } catch (error) {
      if (version === generation.current && error.code === "AUTH_REQUIRED") {
        clearSession();
        setError("로그인이 만료됐습니다. 다시 로그인해 주세요.");
      }
      throw error;
    }
  }
  const value = {
    user: session?.user,
    loading,
    error,
    restore,
    run,
    async login(username, password) {
      const version = ++generation.current;
      const next = await authApi.login(username, password);
      if (version !== generation.current) return;
      clearRequestData();
      setSession(next);
      setError("");
    },
    demo(role) {
      if (authMode !== "mock" || !["user", "admin"].includes(role)) return;
      clearSession();
      setError("");
      setSession({
        user: {
          id: `demo-${role}`,
          username: role === "admin" ? "DEMO0002" : "DEMO0001",
          full_name: role === "admin" ? "보안팀 체험" : "직원 체험",
          role,
        },
        session_expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
      });
    },
    async logout() {
      if (authMode === "real") await run(() => authApi.logout());
      clearSession();
    },
    clearSession,
    updateUser(user) {
      setSession((current) =>
        current?.user.id === user?.id && current.user.role === user.role
          ? { ...current, user }
          : current,
      );
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  return useContext(AuthContext);
}
