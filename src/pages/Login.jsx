import { describeApiError } from "../api/http.js";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { authMode } from "../api/services.js";
import { Brand, Notice } from "../components/Common.jsx";
import Icon from "../components/Icon.jsx";

export default function Login() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("password").length > 30) {
      setError("비밀번호는 30자 이내로 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await auth.login(data.get("username"), data.get("password"));
      form.reset();
    } catch (error) {
      setError(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">YOUR WORK, PROTECTED.</span>
          <h1>
            좋은 생각에 집중하세요.
            <br />
            정보는 동료가 살필게요.
          </h1>
          <p>
            문서 속 민감정보를 먼저 확인하고,
            <br />
            내가 승인한 내용으로 AI와 일합니다.
          </p>
        </div>
        <div className="story-footer">
          <span className="status-dot" />
          검사 → 전송 확인 → 답변
        </div>
      </div>
      <section className="login-form">
        <span className="eyebrow">AI WORKSPACE</span>
        <h2>
          {authMode === "mock" ? "동료를 만나보세요" : "다시 만나 반가워요"}
        </h2>
        <p className="muted">
          {authMode === "mock"
            ? "역할을 선택해 화면 흐름을 확인해 보세요."
            : "회사에서 발급받은 계정으로 로그인하세요."}
        </p>
        <Notice kind="error">{error || auth.error}</Notice>
        {authMode === "real" && auth.error && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => auth.restore()}
          >
            로그인 상태 다시 확인
          </button>
        )}
        {authMode === "mock" ? (
          <>
            <div className="demo-label">
              화면 개발용 체험 · 실제 로그인 아님
            </div>
            <button className="primary full" onClick={() => auth.demo("user")}>
              직원으로 체험하기 <Icon name="arrow_forward" />
            </button>
            <button
              className="secondary full"
              onClick={() => auth.demo("admin")}
            >
              관리자로 체험하기 <Icon name="arrow_forward" />
            </button>
            <p className="fine-print">
              실제 계정이나 비밀번호를 입력하지 않습니다.
              <br />
              체험 데이터는 새로고침 또는 로그아웃 시 초기화됩니다.
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              로그인 ID
              <input
                name="username"
                autoComplete="username"
                required
                pattern="[A-Z0-9]{8}"
                title="대문자 영문 또는 숫자로 된 8자리 ID"
                aria-describedby="login-id-help"
                placeholder="발급받은 ID"
              />
            </label>
            <p className="fine-print" id="login-id-help">
              로그인 ID는 대문자 영문 또는 숫자로 된 8자리입니다.
            </p>
            <label>
              비밀번호
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy ? "로그인 중…" : "로그인"}
            </button>
            <p className="fine-print">
              계정 발급이나 비밀번호 재설정은 관리자에게 문의하세요.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
