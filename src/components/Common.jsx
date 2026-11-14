import Icon from "./Icon.jsx";

const noticeIcons = { info: "info", warning: "warning", error: "error" };

export function Brand({ name = "Mask Assistant" }) {
  return (
    <div className="brand">
      <img
        className="brand-symbol"
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
      />
      <span className="brand-name">{name}</span>
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
