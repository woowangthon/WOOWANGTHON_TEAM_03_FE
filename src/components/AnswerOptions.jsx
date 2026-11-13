import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { useOverlay } from "./Material.jsx";

export default function AnswerOptions({ disabled, onDelete }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);
  const id = useId();
  const position = useOverlay(open, trigger, panel, () => setOpen(false), 176);
  function choose(action) {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
    action();
  }
  return (
    <div
      className="answer-options"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }
      }}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !panel.current?.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="icon-button"
        aria-label="답변 더보기"
        title="답변 더보기"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more_vert" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            className="md-menu answer-options-panel"
            style={position}
          >
            <button
              type="button"
              className="delete-action"
              disabled={disabled}
              onClick={() => choose(onDelete)}
            >
              삭제
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
