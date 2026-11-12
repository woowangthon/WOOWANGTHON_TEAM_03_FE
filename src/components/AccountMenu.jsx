import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

export default function AccountMenu({ onAccount }) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const item = useRef(null);
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const outside = (event) => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="account-menu"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
        if (open && event.key === "Tab") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="icon-button account-menu-trigger"
        title="계정 설정"
        aria-label="계정 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <div
          className="md-menu account-menu-panel"
          role="menu"
          aria-label="본인 계정"
        >
          <button
            type="button"
            ref={item}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAccount();
            }}
          >
            <Icon name="account_circle" />
            계정 설정
          </button>
        </div>
      )}
    </div>
  );
}
