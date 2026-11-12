import { useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { describeApiError } from "../api/http.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { authApi, authMode } from "../api/services.js";
import { Empty, Notice, Spinner } from "../components/Common.jsx";
import { PasswordField, Select, TextField } from "../components/Material.jsx";
import Icon from "../components/Icon.jsx";
import PasswordRules from "../components/PasswordRules.jsx";
import AdminOverview, { AdminAuditDetail } from "./AdminOverview.jsx";
import { useAdminBack, useAdminScroll } from "./AdminNavigation.js";

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
const actionLabels = {
  create: "일반 계정 발급",
  name: "이름 변경",
  password: "비밀번호 재설정",
  deactivate: "계정 비활성화",
};

function UserAction({ action, close, refresh, standalone = false }) {
  const auth = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy || authMode === "mock") return;
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
      if (alive.current) {
        refresh();
        if (!standalone) close();
      }
    } catch (err) {
      if (alive.current) setError(describeApiError(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const Heading = standalone ? "h1" : "h2";
  return (
    <section className="panel action-panel" aria-labelledby="action-heading">
      <div className="panel-title">
        <Heading id="action-heading">{actionLabels[action.type]}</Heading>
        <button
          className="text-button page-back"
          disabled={busy}
          onClick={close}
        >
          {standalone ? "뒤로가기" : "닫기"}
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
          <TextField
            label="로그인 ID"
            name="username"
            required
            pattern="[A-Z0-9]{8}"
            title="대문자 영문 또는 숫자 8자리"
          />
        )}
        {["create", "name"].includes(action.type) && (
          <TextField
            label="이름"
            name="full_name"
            defaultValue={action.user?.full_name || ""}
            required
          />
        )}
        {["create", "password"].includes(action.type) && (
          <PasswordField
            label={action.type === "create" ? "초기 비밀번호" : "새 비밀번호"}
            name={action.type === "create" ? "password" : "new_password"}
            aria-describedby="user-password-rules"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={30}
          />
        )}
        {["create", "password"].includes(action.type) && (
          <PasswordRules id="user-password-rules" />
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
          disabled={busy || authMode === "mock"}
        >
          {busy ? "처리 중…" : actionLabels[action.type]}
        </button>
      </form>
    </section>
  );
}

function AdminHome({ children, title = "보안 현황" }) {
  return (
    <div className="page-content">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

function Users() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const status = ["active", "inactive", "all"].includes(params.get("status"))
    ? params.get("status")
    : "active";
  const requestedPage = Number(params.get("page"));
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedSearch, setLoadedSearch] = useState(null);
  const [action, setAction] = useState(null);
  const saveScroll = useAdminScroll(
    !loading && loadedSearch === location.search,
  );
  function update(filters, replace = false) {
    const next = { q, status, page, ...filters };
    const search = new URLSearchParams();
    if (next.q) search.set("q", next.q);
    if (next.status !== "active") search.set("status", next.status);
    if (next.page > 1) search.set("page", next.page);
    setParams(search, { replace });
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setAction(null);
    setData(null);
    setLoadedSearch(null);
    const timer = setTimeout(async () => {
      try {
        let result;
        if (authMode === "mock") {
          const rows = exampleUsers.filter(
            (user) =>
              (status === "all" || user.is_active === (status === "active")) &&
              `${user.username} ${user.full_name}`
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
      } catch (err) {
        if (active) {
          setData(null);
          setError(describeApiError(err));
          if (err.code === "PAGE_NOT_FOUND" && page > 1)
            update({ page: 1 }, true);
        }
      } finally {
        if (active) {
          setLoading(false);
          setLoadedSearch(location.search);
        }
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, status, page, refreshKey, location.search]);

  function inspect(user) {
    saveScroll();
    navigate(`/admin/users/${encodeURIComponent(user.id)}${location.search}`, {
      state: { adminReturn: "/admin/users", username: user.username },
    });
  }
  return (
    <>
      {authMode === "mock" && (
        <Notice>
          사용자 목록은 가상 예시입니다. 계정 변경은 실제 인증 연결 후 사용할 수
          있습니다.
        </Notice>
      )}
      <Notice>{location.state?.message}</Notice>
      <div className="user-toolbar">
        <TextField
          className="search-label"
          label="사용자 검색"
          placeholder="ID 또는 이름 검색"
          value={q}
          maxLength={100}
          onChange={(event) => update({ q: event.target.value, page: 1 }, true)}
        />
        <Select
          label="계정 상태"
          value={status}
          onChange={(event) => update({ status: event.target.value, page: 1 })}
        >
          <option value="active">활성 계정</option>
          <option value="inactive">비활성 계정</option>
          <option value="all">전체 계정</option>
        </Select>
        <button
          className="primary"
          disabled={authMode === "mock"}
          onClick={() => setAction({ type: "create" })}
        >
          <Icon name="add" />
          <span className="sr-only">＋ </span>계정 발급
        </button>
      </div>
      <Notice kind="error">{error}</Notice>
      {action && (
        <UserAction
          key={action.type + (action.user?.id || "")}
          action={action}
          close={() => setAction(null)}
          refresh={() => setRefreshKey((value) => value + 1)}
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
              {data.results.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.full_name}</td>
                  <td>
                    <span className="status-dot" />
                    {user.is_active ? "활성" : "비활성"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${user.full_name} 계정 상세 보기`}
                      title="계정 상세 보기"
                      onClick={() => inspect(user)}
                    >
                      <Icon name="search" />
                    </button>
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
            className="icon-button"
            aria-label="이전"
            title="이전"
            disabled={!data.previous_page || loading}
            onClick={() => update({ page: data.previous_page })}
          >
            <Icon name="chevron_left" />
          </button>
          <span>{data.page}페이지</span>
          <button
            className="icon-button"
            aria-label="다음"
            title="다음"
            disabled={!data.next_page || loading}
            onClick={() => update({ page: data.next_page })}
          >
            <Icon name="chevron_right" />
          </button>
        </div>
      )}
    </>
  );
}

// The API exposes paginated user lists, not a user-detail endpoint. A hint narrows
// the search after a list click; direct URLs still resolve the exact server ID.
async function findUser(auth, id, username, isActive) {
  if (authMode === "mock")
    return exampleUsers.find((user) => user.id === id) || null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return null;
  for (const q of username ? [username, ""] : [""]) {
    const visited = new Set();
    let page = 1;
    while (page && isActive()) {
      if (visited.has(page))
        throw new Error("사용자 목록의 페이지 정보를 확인할 수 없습니다.");
      visited.add(page);
      const response = await auth.run(() =>
        authApi.listUsers({ q, status: "all", page, page_size: 20 }),
      );
      if (!isActive()) return null;
      if (!Array.isArray(response.results))
        throw new Error("사용자 목록을 확인할 수 없습니다.");
      const found = response.results.find((user) => user.id === id);
      if (found) return found;
      const next = response.next_page;
      if (next != null && (!Number.isInteger(next) || next <= page))
        throw new Error("사용자 목록의 페이지 정보를 확인할 수 없습니다.");
      page = next;
    }
  }
  return null;
}

function UserEdit({ type }) {
  const auth = useAuth();
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const detailPath = `/admin/users/${userId}`;
  const fromDetail = location.state?.adminReturn === detailPath;
  const back = useAdminBack(fromDetail ? detailPath : "/admin/users");
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const username = location.state?.username;
  useAdminScroll(!loading);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setUser(null);
    findUser(auth, userId, username, () => active)
      .then((result) => {
        if (!active) return;
        if (!result) setError("사용자를 찾을 수 없습니다.");
        else if (!result.is_active)
          setError("비활성 계정은 변경할 수 없습니다.");
        else setUser(result);
      })
      .catch((err) => {
        if (active) setError(describeApiError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, username]);
  return (
    <div className="page-content detail-page">
      {loading ? (
        <Spinner>사용자를 확인하는 중</Spinner>
      ) : user ? (
        <>
          {authMode === "mock" && (
            <Notice>
              가상 계정입니다. 계정 변경은 실제 인증 연결 후 사용할 수 있습니다.
            </Notice>
          )}
          <UserAction
            key={`${type}:${user.id}`}
            action={{ type, user }}
            standalone
            close={back}
            refresh={() =>
              fromDetail
                ? navigate(-1)
                : navigate(`/admin/users${location.search}`, {
                    replace: true,
                    state: {
                      message:
                        type === "name"
                          ? "이름을 변경했습니다."
                          : "비밀번호를 재설정했습니다.",
                    },
                  })
            }
          />
        </>
      ) : (
        <>
          <button className="text-button page-back" onClick={back}>
            뒤로가기
          </button>
          <Notice kind="error">{error}</Notice>
        </>
      )}
    </div>
  );
}

function UserProfile() {
  const auth = useAuth();
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const back = useAdminBack("/admin/users");
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [deactivate, setDeactivate] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setUser(null);
    findUser(auth, userId, location.state?.username, () => active)
      .then((result) => {
        if (active) {
          setUser(result);
          if (!result) setError("사용자를 찾을 수 없습니다.");
        }
      })
      .catch((err) => {
        if (active) setError(describeApiError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, version, location.state?.username]);
  function edit(type) {
    navigate(`/admin/users/${userId}/${type}${location.search}`, {
      state: { adminReturn: `/admin/users/${userId}`, username: user.username },
    });
  }
  return (
    <div className="page-content detail-page user-detail-page">
      <div className="panel-title">
        <h1>사용자 계정 정보</h1>
        <button type="button" className="text-button page-back" onClick={back}>
          뒤로가기
        </button>
      </div>
      <Notice kind="error">{error}</Notice>
      {loading ? (
        <Spinner>사용자를 확인하는 중</Spinner>
      ) : (
        user && (
          <>
            <section className="panel" aria-label="사용자 정보">
              <dl className="user-facts">
                <div>
                  <dt>로그인 ID</dt>
                  <dd>{user.username}</dd>
                </div>
                <div>
                  <dt>이름</dt>
                  <dd>{user.full_name}</dd>
                </div>
                <div>
                  <dt>UUID</dt>
                  <dd>{user.id}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{user.is_active ? "활성" : "비활성"}</dd>
                </div>
              </dl>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={authMode === "mock" || !user.is_active}
                  onClick={() => edit("name")}
                >
                  이름 변경
                </button>
                <button
                  className="secondary"
                  disabled={authMode === "mock" || !user.is_active}
                  onClick={() => edit("password")}
                >
                  비밀번호 재설정
                </button>
                <button
                  className="text-button"
                  disabled={authMode === "mock" || !user.is_active}
                  onClick={() => setDeactivate(true)}
                >
                  비활성화
                </button>
              </div>
            </section>
            {deactivate && (
              <UserAction
                action={{ type: "deactivate", user }}
                close={() => setDeactivate(false)}
                refresh={() => {
                  setDeactivate(false);
                  setVersion((value) => value + 1);
                }}
              />
            )}
          </>
        )
      )}
    </div>
  );
}

export default function Admin() {
  return (
    <Routes>
      <Route
        index
        element={
          <AdminHome>
            <AdminOverview key="dashboard" />
          </AdminHome>
        }
      />
      <Route
        path="audit"
        element={
          <div className="page-content">
            <h1>요청 감사 목록</h1>
            <AdminOverview key="audit" view="audit" />
          </div>
        }
      />
      <Route path="audit/:requestId" element={<AdminAuditDetail />} />
      <Route
        path="users"
        element={
          <AdminHome title="사용자 관리">
            <Users />
          </AdminHome>
        }
      />
      <Route path="users/:userId" element={<UserProfile />} />
      <Route path="users/:userId/name" element={<UserEdit type="name" />} />
      <Route
        path="users/:userId/password"
        element={<UserEdit type="password" />}
      />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
