import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { useOverlay } from "./Material.jsx";

export default function AccountMenu({ user, onAccount, onLogout, loggingOut }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);
  const id = useId();
  const position = useOverlay(open, trigger, panel, () => setOpen(false), 288);
  const role = user.role === "admin" ? "보안 관리자" : "일반 사용자";
  useEffect(() => {
    if (open && position.visibility === "visible")
      panel.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [open, position.visibility]);
  function choose(action) {
    setOpen(false);
    action();
  }
  return (
    <div
      className="account-menu"
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !panel.current?.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="profile-link"
        aria-label="내 계정 메뉴"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="profile-avatar">{user.full_name.slice(0, 1)}</span>
        <span className="profile-name">
          <strong>{user.full_name}</strong>
          <small>{role}</small>
        </span>
        <Icon name="expand_more" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            className="md-menu profile-popup"
            role="dialog"
            aria-label="계정 정보"
            style={position}
          >
            <div className="profile-summary">
              <strong>{user.full_name}</strong>
              <span>{user.username}</span>
              <small>{role}</small>
            </div>
            <button type="button" onClick={() => choose(onAccount)}>
              <Icon name="account_circle" />
              계정 설정
            </button>
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => choose(onLogout)}
            >
              <Icon name="arrow_outward" />
              {loggingOut ? "로그아웃 중…" : "로그아웃"}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
