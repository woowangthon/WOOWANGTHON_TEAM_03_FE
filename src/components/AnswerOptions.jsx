import { useId, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useOverlay } from "./Material.jsx";

export default function AnswerOptions({
  disabled,
  onContext,
  contextVisible,
  onRefresh,
  onHide,
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);
  const id = useId();
  const position = useOverlay(open, trigger, panel, () => setOpen(false), 176);
  function choose(action) {
    setOpen(false);
    trigger.current?.focus();
    action();
  }
  return (
    <div
      className="answer-options"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
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
      {open && (
        <div
          ref={panel}
          id={id}
          className="md-menu answer-options-panel"
          style={position}
        >
          {onContext && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => choose(onContext)}
            >
              {contextVisible ? "첨부파일 숨기기" : "첨부파일 보기"}
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => choose(onRefresh)}
          >
            상태 다시 조회
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => choose(onHide)}
          >
            목록에서 숨기기
          </button>
        </div>
      )}
    </div>
  );
}
