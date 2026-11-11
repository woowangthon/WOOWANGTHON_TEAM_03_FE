import { describeApiError } from "../api/http.js";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { authApi, authMode, requestMode } from "../api/services.js";
import { Empty, Notice, Spinner } from "../components/Common.jsx";
import Icon from "../components/Icon.jsx";
import AdminOverview from "./AdminOverview.jsx";

const exampleUsers = [
  {
    id: "example-1",
    username: "USER0001",
    full_name: "가상 사용자 하나",
    is_active: true,
  },
  {
    id: "example-2",
    username: "USER0002",
    full_name: "가상 사용자 둘",
    is_active: true,
  },
  {
    id: "example-3",
    username: "USER0003",
    full_name: "가상 사용자 셋",
    is_active: false,
  },
];
const metrics = [
  ["전체 요청", "24"],
  ["탐지 구간", "68"],
  ["경고 요청", "3"],
  ["검사 이상", "1"],
  ["정책 차단", "2"],
  ["외부 전송 확인", "12"],
];

function UserAction({ action, close, refresh }) {
  const auth = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const labels = {
    create: "일반 계정 발급",
    name: "이름 변경",
    password: "비밀번호 재설정",
    deactivate: "계정 비활성화",
  };
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await auth.run(() => {
        if (action.type === "create") return authApi.createUser(data);
        if (action.type === "name")
          return authApi.changeUserName(action.user.id, data.full_name);
        if (action.type === "password")
          return authApi.resetPassword(action.user.id, data.new_password);
        return authApi.deactivate(action.user.id);
      });
      refresh();
      close();
    } catch (error) {
      setError(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel action-panel" aria-labelledby="action-heading">
      <div className="panel-title">
        <h2 id="action-heading">{labels[action.type]}</h2>
        <button className="text-button" disabled={busy} onClick={close}>
          닫기
        </button>
      </div>
      {action.user && (
        <p>
          {action.user.username} · {action.user.full_name}
        </p>
      )}
      <Notice kind="error">{error}</Notice>
      <form onSubmit={submit}>
        {action.type === "create" && (
          <label>
            로그인 ID
            <input
              name="username"
              required
              pattern="[A-Z0-9]{8}"
              title="대문자 영문 또는 숫자 8자리"
            />
          </label>
        )}
        {["create", "name"].includes(action.type) && (
          <label>
            이름
            <input
              name="full_name"
              defaultValue={action.user?.full_name || ""}
              required
            />
          </label>
        )}
        {["create", "password"].includes(action.type) && (
          <label>
            {action.type === "create" ? "초기 비밀번호" : "새 비밀번호"}
            <input
              name={action.type === "create" ? "password" : "new_password"}
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={30}
            />
          </label>
        )}
        {action.type === "deactivate" && (
          <Notice kind="warning">
            이 계정의 새 로그인과 다음 인증 요청이 거부됩니다. 이력은 삭제되지
            않으며 진행 중인 AI 작업을 자동 중단하지 않습니다. 재활성화는
            지원하지 않습니다.
          </Notice>
        )}
        <button
          className={action.type === "deactivate" ? "danger" : "primary"}
          disabled={busy}
        >
          {busy ? "처리 중…" : labels[action.type]}
        </button>
      </form>
    </section>
  );
}

export default function Admin() {
  const auth = useAuth();
  const [tab, setTab] = useState("overview");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState(null);
  useEffect(() => {
    if (tab !== "users") return;
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        let result;
        if (authMode === "mock") {
          const rows = exampleUsers.filter(
            (u) =>
              (status === "all" || u.is_active === (status === "active")) &&
              (u.username + " " + u.full_name)
                .toLowerCase()
                .includes(q.trim().toLowerCase()),
          );
          result = {
            count: rows.length,
            results: rows,
            page: 1,
            next_page: null,
            previous_page: null,
          };
        } else
          result = await auth.run(() =>
            authApi.listUsers({ q: q.trim(), status, page }),
          );
        if (active) setData(result);
      } catch (error) {
        if (active) {
          setData(null);
          setError(describeApiError(error));
          if (error.code === "PAGE_NOT_FOUND" && page > 1) setPage(1);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // Latest query wins; older responses cannot replace a new filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, status, page, refreshKey]);
  return (
    <div className="page-content">
      <h1>보안 현황</h1>
      <p className="muted">요청의 흐름을 확인하고 사용자 계정을 관리하세요.</p>
      <div className="tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          이용 현황
        </button>
        <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          사용자 관리
        </button>
      </div>
      {tab === "overview" ? (
        requestMode === "real" ? (
          <AdminOverview />
        ) : (
          <>
            <Notice>
              가상 통계로 구성한 화면 예시입니다. 실제 이용 현황이나 현재 체험
              요청의 집계가 아닙니다.
            </Notice>
            <div className="metrics">
              {metrics.map(([label, value]) => (
                <div className="metric" key={label}>
                  <span>{label}</span>
                  <strong>
                    {value}
                    <small>건</small>
                  </strong>
                </div>
              ))}
            </div>
            <section className="panel">
              <div className="panel-title">
                <h2>최근 요청 추이</h2>
                <span className="fine-print">가상 7일 데이터</span>
              </div>
              <div
                className="bar-chart"
                role="img"
                aria-label="가상 7일 요청 건수: 2, 4, 3, 5, 4, 2, 4건"
              >
                {[2, 4, 3, 5, 4, 2, 4].map((value, i) => (
                  <div className="bar-column" key={i}>
                    <span>{value}</span>
                    <div className="bar" style={{ height: value * 20 }} />
                    <small>{i + 1}일차</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>최근 차단·경고</h2>
              <div className="event-row">
                <span className="state-tag blocked">정책 차단</span>
                <div>
                  <strong>거래처 정보 일괄 전송 요청</strong>
                  <p className="muted">가상 사례 · 외부 미전송</p>
                </div>
              </div>
              <div className="event-row">
                <span className="state-tag awaiting_approval">경고</span>
                <div>
                  <strong>지시 삽입 의심 문구 감지</strong>
                  <p className="muted">가상 사례 · 사용자 확인 대기</p>
                </div>
              </div>
              <p className="fine-print">
                타인의 AI 답변은 관리자 화면에 제공하지 않습니다.
              </p>
            </section>
          </>
        )
      ) : (
        <>
          {authMode === "mock" && (
            <Notice>
              사용자 목록은 가상 예시입니다. 계정 발급·이름
              변경·재설정·비활성화는 실제 인증 연결 후 사용할 수 있습니다.
            </Notice>
          )}
          <div className="user-toolbar">
            <label className="search-label">
              <span className="sr-only">사용자 검색</span>
              <input
                placeholder="ID 또는 이름 검색"
                value={q}
                maxLength={100}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <select
              aria-label="계정 상태"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="active">활성 계정</option>
              <option value="inactive">비활성 계정</option>
              <option value="all">전체 계정</option>
            </select>
            <button
              className="primary"
              disabled={authMode === "mock"}
              onClick={() => setAction({ type: "create" })}
            >
              {/* The plus stays in the accessible name; the browser tests look the button up by it. */}
              <Icon name="add" />
              <span className="sr-only">＋ </span>
              계정 발급
            </button>
          </div>
          <Notice kind="error">{error}</Notice>
          {action && (
            <UserAction
              key={action.type + (action.user?.id || "")}
              action={action}
              close={() => setAction(null)}
              refresh={() => setRefreshKey((v) => v + 1)}
            />
          )}
          {loading ? (
            <Spinner />
          ) : data?.results.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>로그인 ID</th>
                    <th>이름</th>
                    <th>상태</th>
                    <th>계정 관리</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.full_name}</td>
                      <td>
                        <span className="status-dot" />
                        {u.is_active ? "활성" : "비활성"}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            disabled={authMode === "mock" || !u.is_active}
                            onClick={() => setAction({ type: "name", user: u })}
                          >
                            이름 변경
                          </button>
                          <button
                            disabled={authMode === "mock" || !u.is_active}
                            onClick={() =>
                              setAction({ type: "password", user: u })
                            }
                          >
                            비밀번호 재설정
                          </button>
                          <button
                            disabled={authMode === "mock" || !u.is_active}
                            onClick={() =>
                              setAction({ type: "deactivate", user: u })
                            }
                          >
                            비활성화
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !error && (
              <Empty title="검색 결과가 없습니다">
                검색어나 계정 상태를 바꿔 보세요.
              </Empty>
            )
          )}
          {data && (
            <div className="pagination">
              <span>전체 {data.count}명</span>
              <button
                disabled={!data.previous_page || loading}
                onClick={() => setPage(data.previous_page)}
              >
                이전
              </button>
              <span>{data.page}페이지</span>
              <button
                disabled={!data.next_page || loading}
                onClick={() => setPage(data.next_page)}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
