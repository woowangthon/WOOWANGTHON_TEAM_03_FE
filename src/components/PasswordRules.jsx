import { useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useOverlay } from "./Material.jsx";

export default function PasswordRules({ id }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);
  const position = useOverlay(open, trigger, panel, () => setOpen(false), 360);
  return (
    <div
      className="password-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!trigger.current?.matches(":focus")) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="icon-button"
        aria-label="비밀번호 규칙"
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        <Icon name="info" />
      </button>
      <div
        ref={panel}
        id={id}
        role="tooltip"
        hidden={!open}
        className="password-rules md-menu"
        style={open ? position : undefined}
      >
        <strong>비밀번호 규칙</strong>
        <ul>
          <li>길이: 10자 이상 30자 이하</li>
          <li>
            필수 조합: 영문 대문자·소문자·숫자·허용 특수문자를 각각 1개 이상
            포함
          </li>
          <li>
            허용 문자: 영문·숫자·허용 특수문자만 사용 가능, 공백·한글 사용 불가
          </li>
          <li>
            추가 제한: 흔한 비밀번호나 로그인 ID 등 계정 정보와 지나치게 유사한
            비밀번호 사용 불가
          </li>
        </ul>
      </div>
    </div>
  );
}
