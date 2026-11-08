import { describeApiError } from "../api/http.js";
import { useState } from "react";
import { authApi, authMode } from "../api/services.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { Notice } from "../components/Common.jsx";

export default function Account() {
  const auth = useAuth();
  const [name, setName] = useState(auth.user.full_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function saveName(event) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data =
        authMode === "mock"
          ? { user: { ...auth.user, full_name: name } }
          : await auth.run(() => authApi.changeName(name));
      auth.updateUser(data.user);
      setMessage(
        authMode === "mock"
          ? "체험 화면의 이름을 변경했습니다. 새로고침하면 초기화됩니다."
          : "이름을 변경했습니다.",
      );
    } catch (error) {
      setError(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event) {
    event.preventDefault();
    if (busy || authMode === "mock") return;
    const form = event.currentTarget;
    const values = new FormData(form);
    if (values.get("new") !== values.get("confirm")) {
      setError("새 비밀번호 확인 값이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await auth.run(() =>
        authApi.changePassword(values.get("current"), values.get("new")),
      );
      form.reset();
      auth.clearSession();
    } catch (error) {
      setError(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-content narrow">
      <span className="eyebrow">ACCOUNT</span>
      <h1>내 계정</h1>
      <p className="muted">계정 정보와 로그인 설정을 확인하세요.</p>
      <Notice kind="error">{error}</Notice>
      <Notice>{message}</Notice>
      <section className="panel">
        <h2>기본 정보</h2>
        <div className="identity-row">
          <span className="profile-avatar">
            {auth.user.full_name.slice(0, 1)}
          </span>
          <div>
            <strong>{auth.user.full_name}</strong>
            <p className="muted">
              {auth.user.username} ·{" "}
              {auth.user.role === "admin" ? "관리자" : "일반 사용자"}
            </p>
          </div>
        </div>
        <form onSubmit={saveName}>
          <label>
            이름
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
          <p className="fine-print">
            로그인 ID는 변경할 수 없습니다. 이름을 변경해도 로그인은 유지됩니다.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "처리 중…" : "이름 저장"}
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>비밀번호 변경</h2>
        {authMode === "mock" ? (
          <Notice>
            체험에서는 비밀번호를 수집하거나 변경하지 않습니다. 실제 인증 연결
            후 사용할 수 있습니다.
          </Notice>
        ) : (
          <form onSubmit={changePassword}>
            <label>
              현재 비밀번호
              <input
                name="current"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              새 비밀번호
              <input
                name="new"
                type="password"
                required
                minLength={10}
                maxLength={30}
                autoComplete="new-password"
              />
            </label>
            <label>
              새 비밀번호 확인
              <input
                name="confirm"
                type="password"
                required
                minLength={10}
                maxLength={30}
                autoComplete="new-password"
              />
            </label>
            <p className="fine-print">
              10~30자, 대문자·소문자·숫자·허용 특수문자를 포함해야 합니다.
              서버의 추가 검증이 적용됩니다. 변경 후 다시 로그인해 주세요.
            </p>
            <button className="primary" disabled={busy}>
              비밀번호 변경 후 로그아웃
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
