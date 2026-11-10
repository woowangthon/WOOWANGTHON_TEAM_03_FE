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
import IntakeWorkspace from "./pages/IntakeWorkspace.jsx";
import { requestStateLabel } from "./api/requests.js";
import Account from "./pages/Account.jsx";
import Admin from "./pages/Admin.jsx";

function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
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
  const [menuOpen, setMenuOpen] = useState(false);
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
        {isEmployee && (
          <button className="new-request" onClick={() => select(null)}>
            <span>＋</span> 새 요청
          </button>
        )}
        <nav className="main-nav">
          {isEmployee && (
            <NavLink to="/" end onClick={() => setMenuOpen(false)}>
              ◈ <span>AI 작업 공간</span>
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin" onClick={() => setMenuOpen(false)}>
              ▦ <span>보안 현황</span>
            </NavLink>
          )}
          <NavLink to="/account" onClick={() => setMenuOpen(false)}>
            ○ <span>내 계정</span>
          </NavLink>
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
                  <button onClick={() => setHistoryVersion((v) => v + 1)}>
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
                  disabled={historyLoading || !historyPaging.previous_page}
                  onClick={() => setHistoryPage(historyPaging.previous_page)}
                >
                  이전 요청
                </button>
                <span>
                  {historyPaging.page} / {historyPaging.total_pages}
                </span>
                <button
                  disabled={historyLoading || !historyPaging.next_page}
                  onClick={() => setHistoryPage(historyPaging.next_page)}
                >
                  다음 요청
                </button>
              </div>
            )}
          </>
        )}
        <div className="sidebar-footer">
          <div className="privacy-card">
            <span>◇</span>
            <p>
              {isAdmin ? "관리와 AI 이용을 구분해요" : "전송 전, 한 번 더 확인"}
              <br />
              <small>
                {isAdmin
                  ? "AI 이용은 본인의 일반 계정으로 로그인하세요."
                  : "내가 승인한 내용으로 일하세요."}
              </small>
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
          <span>{isAdmin ? "보안 관리" : "나의 안전한 AI 작업 공간"}</span>
          <div className="connection-status">
            <span className="status-dot" />
            {authMode === "mock" ? "체험 계정" : "서버 인증"} ·{" "}
            {isAdmin
              ? requestMode === "mock"
                ? "통계 예시"
                : "통계 연결 준비 중"
              : requestMode === "mock"
                ? "가상 요청"
                : "의뢰 접수 연결"}
          </div>
        </header>
        {(isAdmin || authMode === "mock" || requestMode === "mock") && (
          <div className="mode-banner">
            {authMode === "mock"
              ? "개발 미리보기 · 가상 데이터는 브라우저 메모리에만 유지되며 실제 AI로 전송되지 않습니다."
              : isAdmin
                ? requestMode === "mock"
                  ? "계정 관리는 실제 서버에 반영됩니다. 통계와 최근 차단·경고는 화면 예시입니다."
                  : "계정 관리는 실제 서버에 반영됩니다. 요청 감사와 통계는 다음 연결 단계입니다."
                : "로그인은 실제 서버를 사용합니다. 요청·답변은 화면 예시이며 실제 AI로 전송되지 않습니다."}
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
                    onHistoryChange={() => {
                      setHistoryPage(1);
                      setHistoryVersion((v) => v + 1);
                    }}
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
            path="/admin"
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
