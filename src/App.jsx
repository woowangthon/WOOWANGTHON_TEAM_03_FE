import { useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import { authMode, requestApi, requestMode } from "./api/services.js";
import { stateLabels } from "./domain/requests.js";
import { Brand, Notice, Spinner } from "./components/Common.jsx";
import Login from "./pages/Login.jsx";
import Workspace from "./pages/Workspace.jsx";
import Account from "./pages/Account.jsx";
import Admin from "./pages/Admin.jsx";

function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [history, setHistory] = useState([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = params.get("request");
  useEffect(() => {
    let active = true;
    auth
      .run(() => requestApi.list(auth.user))
      .then((rows) => {
        if (active) {
          setHistory(rows);
          setHistoryError("");
        }
      })
      .catch((error) => {
        if (active) setHistoryError(error.message);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyVersion, auth.user.id]);
  function select(id) {
    navigate(id ? "/?request=" + encodeURIComponent(id) : "/");
    setMenuOpen(false);
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    try {
      await auth.logout();
      navigate("/");
    } catch (error) {
      setError(error.message);
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <Brand />
        <button className="new-request" onClick={() => select(null)}>
          <span>＋</span> 새 요청
        </button>
        <nav className="main-nav">
          <NavLink to="/" end onClick={() => setMenuOpen(false)}>
            ◈ <span>AI 작업 공간</span>
          </NavLink>
          {auth.user.role === "admin" && (
            <NavLink to="/admin" onClick={() => setMenuOpen(false)}>
              ▦ <span>보안 현황</span>
            </NavLink>
          )}
          <NavLink to="/account" onClick={() => setMenuOpen(false)}>
            ○ <span>내 계정</span>
          </NavLink>
        </nav>
        <div className="history-title">
          최근 요청 <span>{history.length}</span>
        </div>
        <div className="history-list">
          {historyError ? (
            <p className="fine-print">{historyError}</p>
          ) : history.length ? (
            history.map((r) => (
              <button
                className={r.id === selected ? "selected" : ""}
                onClick={() => select(r.id)}
                key={r.id}
              >
                <span>{r.instruction}</span>
                <small>{stateLabels[r.state]}</small>
              </button>
            ))
          ) : (
            <p className="history-empty">
              첫 요청을 시작해 보세요.
              <br />
              이곳에서 다시 확인할 수 있어요.
            </p>
          )}
        </div>
        <div className="sidebar-footer">
          <div className="privacy-card">
            <span>◇</span>
            <p>
              전송 전, 한 번 더 확인
              <br />
              <small>내가 승인한 내용으로 일하세요.</small>
            </p>
          </div>
          <button
            className="profile-link"
            onClick={() => {
              navigate("/account");
              setMenuOpen(false);
            }}
          >
            <span className="profile-avatar">
              {auth.user.full_name.slice(0, 1)}
            </span>
            <span>
              <strong>{auth.user.full_name}</strong>
              <small>
                {auth.user.role === "admin" ? "보안 관리자" : "일반 사용자"}
              </small>
            </span>
          </button>
          <button className="logout" disabled={loggingOut} onClick={logout}>
            {loggingOut ? "로그아웃 중…" : "로그아웃"}
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="메뉴 열기"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ☰
          </button>
          <span>나의 안전한 AI 작업 공간</span>
          <div className="connection-status">
            <span className="status-dot" />
            {authMode === "mock" ? "체험 계정" : "서버 인증"} ·{" "}
            {requestMode === "mock" ? "가상 요청" : "업무 API 준비 중"}
          </div>
        </header>
        {(authMode === "mock" || requestMode === "mock") && (
          <div className="mode-banner">
            개발 미리보기 · 가상 데이터는 브라우저 메모리에만 유지되며 실제 AI로
            전송되지 않습니다.
          </div>
        )}
        <Notice kind="error">{error}</Notice>
        <Routes>
          <Route
            path="/"
            element={
              <Workspace
                selectedId={selected}
                onSelect={select}
                onHistoryChange={() => setHistoryVersion((v) => v + 1)}
              />
            }
          />
          <Route path="/account" element={<Account />} />
          <Route
            path="/admin"
            element={
              auth.user.role === "admin" ? (
                <Admin />
              ) : (
                <div className="page-content">
                  <Notice kind="error">
                    관리자만 접근할 수 있는 화면입니다.
                  </Notice>
                  <button className="secondary" onClick={() => select(null)}>
                    작업 공간으로
                  </button>
                </div>
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
export default function App() {
  const auth = useAuth();
  if (auth.loading)
    return (
      <main className="boot-screen">
        <Brand />
        <Spinner>로그인 상태를 확인하고 있습니다</Spinner>
      </main>
    );
  return auth.user ? <Shell key={auth.user.id} /> : <Login />;
}
