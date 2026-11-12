import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import { authMode, requestApi, requestMode } from "./api/services.js";
import { stateLabels } from "./domain/requests.js";
import { Brand, Notice, Spinner } from "./components/Common.jsx";
import Icon from "./components/Icon.jsx";
import useNavigationDrawer from "./hooks/useNavigationDrawer.js";
import Login from "./pages/Login.jsx";
import Workspace from "./pages/Workspace.jsx";
import IntakeWorkspace from "./pages/IntakeWorkspace.jsx";
import { requestStateLabel } from "./api/requests.js";
import Account from "./pages/Account.jsx";
import Admin from "./pages/Admin.jsx";
import AccountMenu from "./components/AccountMenu.jsx";

function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentLocation = useRef(location);
  currentLocation.current = location;
  const [params] = useSearchParams();
  const [history, setHistory] = useState([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  // A draft and its uncertain intake key survive route changes, never logout.
  const [intakeDraft, setIntakeDraft] = useState({
    text: "",
    file: null,
    attempt: null,
  });
  const [historyPaging, setHistoryPaging] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const {
    isNarrow,
    menuOpen,
    setMenuOpen,
    modalOpen,
    sidebarRef,
    menuButtonRef,
  } = useNavigationDrawer();
  const isAdmin = auth.user.role === "admin";
  const isEmployee = auth.user.role === "user";
  const home = isAdmin ? "/admin" : "/";
  const selected = params.get("request");
  useEffect(() => {
    // Administrators must never load the employee's request history.
    if (!isEmployee) return;
    let active = true;
    setHistoryLoading(true);
    auth
      .run(async () =>
        requestMode === "real"
          ? requestApi.listPage(auth.user, { page: historyPage })
          : { results: await requestApi.list(auth.user) },
      )
      .then((data) => {
        if (active) {
          setHistory(data.results);
          setHistoryPaging(requestMode === "real" ? data : null);
          setHistoryError("");
        }
      })
      .catch((error) => {
        if (active) {
          setHistory([]);
          setHistoryPaging(null);
          setHistoryError(error.message);
        }
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyVersion, historyPage, auth.user.id, isEmployee]);
  function select(id) {
    navigate(id ? "/?request=" + encodeURIComponent(id) : "/");
    setMenuOpen(false);
  }
  function refreshHistory() {
    setHistoryPage(1);
    setHistoryVersion((v) => v + 1);
  }
  function historyHidden(id) {
    setHistory((rows) => rows.filter((row) => row.id !== id));
    refreshHistory();
    const { pathname, search } = currentLocation.current;
    if (pathname === "/" && new URLSearchParams(search).get("request") === id) {
      navigate("/", { replace: true, state: { historyHidden: true } });
    }
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
      {/* Shown only while the drawer is modal (narrow windows); see styles.css. */}
      {modalOpen && (
        <div
          className="scrim"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="navigation-drawer"
        ref={sidebarRef}
        className={`sidebar ${modalOpen ? "open" : ""}`}
        role={modalOpen ? "dialog" : undefined}
        aria-modal={modalOpen || undefined}
        aria-label={modalOpen ? "주 메뉴" : undefined}
        tabIndex={-1}
        inert={isNarrow && !modalOpen}
      >
        {modalOpen && (
          <button
            className="mobile-menu drawer-close"
            aria-label="메뉴 닫기"
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="close" />
          </button>
        )}
        <Brand />
        {isEmployee && (
          <button className="new-request" onClick={() => select(null)}>
            <Icon name="add" /> 새 요청
          </button>
        )}
        <nav className="main-nav">
          {isAdmin && (
            <>
              <NavLink to="/admin" end onClick={() => setMenuOpen(false)}>
                <Icon name="monitoring" /> <span>보안 현황</span>
              </NavLink>
              <NavLink to="/admin/audit" onClick={() => setMenuOpen(false)}>
                <Icon name="verified_user" /> <span>요청 감사 목록</span>
              </NavLink>
              <NavLink to="/admin/users" onClick={() => setMenuOpen(false)}>
                <Icon name="account_circle" /> <span>사용자 관리</span>
              </NavLink>
            </>
          )}
        </nav>
        {isEmployee && (
          <>
            <div className="history-title">
              최근 요청 <span>{historyPaging?.count ?? history.length}</span>
            </div>
            <div className="history-list">
              {historyLoading ? (
                <Spinner>요청 목록 조회 중</Spinner>
              ) : historyError ? (
                <div>
                  <p className="fine-print">{historyError}</p>
                  <button
                    className="text-button"
                    onClick={() => setHistoryVersion((v) => v + 1)}
                  >
                    목록 다시 조회
                  </button>
                </div>
              ) : history.length ? (
                history.map((r) => (
                  <button
                    className={r.id === selected ? "selected" : ""}
                    onClick={() => select(r.id)}
                    key={r.id}
                  >
                    <span>{r.instruction}</span>
                    <small>
                      {requestMode === "real"
                        ? requestStateLabel(r.state)
                        : stateLabels[r.state]}
                    </small>
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
            {historyPaging && historyPaging.total_pages > 1 && (
              <div className="history-pages">
                <button
                  aria-label="이전 요청"
                  title="이전 요청"
                  disabled={historyLoading || !historyPaging.previous_page}
                  onClick={() => setHistoryPage(historyPaging.previous_page)}
                >
                  <Icon name="chevron_left" />
                </button>
                <span>
                  {historyPaging.page} / {historyPaging.total_pages}
                </span>
                <button
                  aria-label="다음 요청"
                  title="다음 요청"
                  disabled={historyLoading || !historyPaging.next_page}
                  onClick={() => setHistoryPage(historyPaging.next_page)}
                >
                  <Icon name="chevron_right" />
                </button>
              </div>
            )}
          </>
        )}
        <div className="sidebar-footer">
          <AccountMenu
            user={auth.user}
            loggingOut={loggingOut}
            onLogout={logout}
            onAccount={() => {
              navigate("/account");
              setMenuOpen(false);
            }}
          />
        </div>
      </aside>
      <div className="main-area" inert={modalOpen}>
        <header className="topbar">
          <button
            className="mobile-menu"
            ref={menuButtonRef}
            aria-label="메뉴 열기"
            aria-controls="navigation-drawer"
            aria-expanded={modalOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name="menu" />
          </button>
        </header>
        {(authMode === "mock" || requestMode === "mock") && (
          <div className="mode-banner">
            체험 화면 ·{" "}
            {authMode === "mock"
              ? "가상 계정·데이터"
              : "실제 계정·가상 요청 데이터"}
          </div>
        )}
        <Notice kind="error">{error}</Notice>
        <Routes>
          <Route
            path="/"
            element={
              isEmployee ? (
                requestMode === "real" ? (
                  <IntakeWorkspace
                    draft={intakeDraft}
                    setDraft={setIntakeDraft}
                    selectedId={selected}
                    onSelect={select}
                    onHistoryChange={refreshHistory}
                    onHistoryHidden={historyHidden}
                    historyHidden={location.state?.historyHidden === true}
                  />
                ) : (
                  <Workspace
                    selectedId={selected}
                    onSelect={select}
                    onHistoryChange={() => setHistoryVersion((v) => v + 1)}
                  />
                )
              ) : (
                <Navigate to="/admin" replace />
              )
            }
          />
          <Route path="/account" element={<Account />} />
          <Route
            path="/admin/*"
            element={
              isAdmin ? (
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
          <Route path="*" element={<Navigate to={home} replace />} />
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
  return auth.user ? (
    <Shell key={`${auth.user.id}:${auth.user.role}`} />
  ) : (
    <Login />
  );
}
