import { createContext, useContext, useEffect, useState } from "react";
import { authApi, authMode, clearRequestData } from "../api/services.js";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(authMode === "real");
  const [error, setError] = useState("");
  function clearSession() {
    clearRequestData();
    setSession(null);
  }
  async function restore() {
    setLoading(true);
    setError("");
    try {
      setSession(await authApi.bootstrap());
    } catch (error) {
      if (error.code !== "AUTH_REQUIRED") setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (authMode === "real") restore();
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
    try {
      return await operation();
    } catch (error) {
      if (error.code === "AUTH_REQUIRED") {
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
      setSession(await authApi.login(username, password));
      setError("");
    },
    demo(role) {
      clearRequestData();
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
      setSession((current) => (current ? { ...current, user } : null));
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  return useContext(AuthContext);
}
