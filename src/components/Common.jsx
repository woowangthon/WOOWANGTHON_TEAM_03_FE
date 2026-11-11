import Icon from "./Icon.jsx";

const noticeIcons = { info: "info", warning: "warning", error: "error" };

export function Brand({ compact = false }) {
  return (
    <div className="brand">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path
            d="M8 7h10a8 8 0 0 1 0 16h-6l-6 4V9a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path
            d="m12 14 3 3 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>동료{!compact && <small>AI 교환기</small>}</span>
    </div>
  );
}
export function Notice({ children, kind = "info" }) {
  return children ? (
    <div
      className={`notice ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon name={noticeIcons[kind]} />
      {children}
    </div>
  ) : null;
}
export function Spinner({ children = "불러오는 중" }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {children}
    </div>
  );
}
export function Empty({ title, children }) {
  return (
    <div className="empty">
      <Icon name="info" className="empty-icon" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
