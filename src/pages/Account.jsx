import { describeApiError } from "../api/http.js";
import { useEffect, useRef, useState } from "react";
import { authApi, authMode } from "../api/services.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { Notice } from "../components/Common.jsx";
import { PasswordField, TextField } from "../components/Material.jsx";
import PasswordRules from "../components/PasswordRules.jsx";

export default function Account() {
  const auth = useAuth();
  const [name, setName] = useState(auth.user.full_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const passwordAlert = useRef(null);
  useEffect(() => {
    if (passwordError)
      passwordAlert.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
  }, [passwordError]);
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
      setPasswordError("새 비밀번호 확인 값이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    setPasswordError("");
    setMessage("");
    try {
      await auth.run(() =>
        authApi.changePassword(values.get("current"), values.get("new")),
      );
      form.reset();
      auth.clearSession();
    } catch (error) {
      setPasswordError(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-content narrow">
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
          <TextField
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            autoComplete="name"
          />
          <p className="fine-print">
            로그인 ID는 변경할 수 없습니다. 이름을 변경해도 로그인은 유지됩니다.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "처리 중…" : "이름 저장"}
          </button>
        </form>
      </section>
      <section className="panel password-panel">
        <div className="panel-title">
          <h2>비밀번호 변경</h2>
          <PasswordRules id="account-password-rules" />
        </div>
        {authMode === "mock" ? (
          <Notice>
            체험에서는 비밀번호를 수집하거나 변경하지 않습니다. 실제 인증 연결
            후 사용할 수 있습니다.
          </Notice>
        ) : (
          <form onSubmit={changePassword}>
            <PasswordField
              label="현재 비밀번호"
              name="current"
              required
              maxLength={30}
              autoComplete="current-password"
            />
            <PasswordField
              label="새 비밀번호"
              name="new"
              aria-describedby="account-password-rules"
              required
              minLength={10}
              maxLength={30}
              autoComplete="new-password"
            />
            <PasswordField
              label="새 비밀번호 확인"
              name="confirm"
              aria-describedby="account-password-rules"
              required
              minLength={10}
              maxLength={30}
              autoComplete="new-password"
            />
            {passwordError && (
              <div ref={passwordAlert}>
                <Notice kind="error">{passwordError}</Notice>
              </div>
            )}
            <button className="primary" disabled={busy}>
              비밀번호 변경 후 로그아웃
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
