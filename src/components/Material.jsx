import {
  Children,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";

export function TextField({
  label,
  leadingIcon,
  trailing,
  error,
  supportingText,
  multiline = false,
  className = "",
  id,
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const description = error || supportingText;
  const Control = multiline ? "textarea" : "input";
  return (
    <div
      className={`md-field ${error ? "md-error" : ""} ${props.disabled ? "md-disabled" : ""} ${className}`}
    >
      <div className="md-field-control">
        {leadingIcon && <Icon name={leadingIcon} />}
        <div className="md-field-body">
          {label && <label htmlFor={inputId}>{label}</label>}
          <Control
            {...props}
            id={inputId}
            aria-invalid={error ? true : props["aria-invalid"]}
            aria-describedby={
              description ? `${inputId}-support` : props["aria-describedby"]
            }
          />
        </div>
        {trailing}
      </div>
      {description && (
        <p className="md-support" id={`${inputId}-support`}>
          {description}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      leadingIcon="lock"
      trailing={
        <button
          type="button"
          className="icon-button"
          aria-label={`${props.label || "비밀번호"} ${visible ? "숨기기" : "보기"}`}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible(!visible)}
        >
          <Icon name={visible ? "visibility_off" : "visibility"} />
        </button>
      }
    />
  );
}

// Fixed overlays stay inside the viewport even inside scrolling tables/forms.
export function useOverlay(open, trigger, panel, dismiss, width) {
  const [position, setPosition] = useState({ visibility: "hidden" });
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const available = Math.max(80, window.innerHeight - 24);
      const panelWidth = Math.min(
        width || Math.max(200, anchor.width),
        window.innerWidth - 24,
      );
      const below = window.innerHeight - anchor.bottom - 12;
      const above = anchor.top - 12;
      const desiredHeight = Math.min(
        panel.current.scrollHeight,
        available,
        360,
      );
      const aboveAnchor = below < desiredHeight && above > below;
      const maxHeight = Math.min(
        360,
        Math.max(80, aboveAnchor ? above - 4 : below - 4),
        available,
      );
      setPosition({
        position: "fixed",
        visibility: "visible",
        width: panelWidth,
        left: Math.max(
          12,
          Math.min(anchor.left, window.innerWidth - panelWidth - 12),
        ),
        top: aboveAnchor
          ? Math.max(12, anchor.top - Math.min(desiredHeight, maxHeight) - 4)
          : Math.min(anchor.bottom + 4, window.innerHeight - maxHeight - 12),
        maxHeight,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const outside = (event) => {
      if (
        !trigger.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      )
        dismissRef.current();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, trigger, panel, width]);
  return position;
}

export function Select({
  label,
  children,
  value,
  defaultValue = "",
  onChange,
  name,
  disabled,
  required,
  className = "",
  id,
  ...props
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const options = Children.toArray(children)
    .filter(Boolean)
    .map((child) => ({
      value: String(child.props.value ?? ""),
      label: child.props.children,
      disabled: child.props.disabled,
    }));
  const [localValue, setLocalValue] = useState(defaultValue);
  const selectedValue = String(value ?? localValue);
  const selected = options.findIndex(
    (option) => option.value === selectedValue,
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef(null);
  const panel = useRef(null);
  const typeahead = useRef({ text: "", time: 0 });
  const position = useOverlay(open, trigger, panel, () => setOpen(false));
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${controlId}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, controlId]);
  function choose(index) {
    const option = options[index];
    if (!option || option.disabled) return;
    setLocalValue(option.value);
    onChange?.({
      target: { value: option.value, name },
      currentTarget: { value: option.value, name },
    });
    setOpen(false);
    trigger.current?.focus();
  }
  function move(direction) {
    for (let step = 1; step <= options.length; step++) {
      const index =
        (active + direction * step + options.length) % options.length;
      if (!options[index].disabled) {
        setActive(index);
        break;
      }
    }
  }
  function keyDown(event) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        setActive(Math.max(0, selected));
        setOpen(true);
      } else if (event.key === "Home")
        setActive(options.findIndex((option) => !option.disabled));
      else if (event.key === "End")
        setActive(options.findLastIndex((option) => !option.disabled));
      else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else {
        setActive(Math.max(0, selected));
        setOpen(true);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
    else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const text =
        (now - typeahead.current.time < 600 ? typeahead.current.text : "") +
        event.key.toLowerCase();
      typeahead.current = { text, time: now };
      const index = options.findIndex(
        (option) =>
          !option.disabled &&
          String(option.label).toLowerCase().startsWith(text),
      );
      if (index >= 0) {
        event.preventDefault();
        setActive(index);
        setOpen(true);
      }
    }
    props.onKeyDown?.(event);
  }
  return (
    <div className={`md-select ${className}`}>
      {name && (
        <input
          type="hidden"
          name={name}
          value={selectedValue}
          disabled={disabled}
        />
      )}
      <button
        {...props}
        id={controlId}
        ref={trigger}
        type="button"
        role="combobox"
        className="md-select-trigger"
        disabled={disabled}
        aria-label={props["aria-label"] || label}
        aria-required={required || undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${controlId}-list` : undefined}
        aria-activedescendant={
          open ? `${controlId}-option-${active}` : undefined
        }
        onKeyDown={keyDown}
        onBlur={(event) => {
          if (!panel.current?.contains(event.relatedTarget)) setOpen(false);
          props.onBlur?.(event);
        }}
        onClick={() => {
          setActive(Math.max(0, selected));
          setOpen(!open);
        }}
      >
        <span className="md-select-text">
          {label && <span className="md-field-label">{label}</span>}
          <span>{options[selected]?.label || "선택"}</span>
        </span>
        <Icon name="expand_more" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={`${controlId}-list`}
            className="md-menu md-options"
            role="listbox"
            aria-label={props["aria-label"] || label}
            style={position}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${controlId}-option-${index}`}
                role="option"
                aria-selected={index === selected}
                aria-disabled={option.disabled || undefined}
                className={`md-option ${index === active ? "active" : ""}`}
                onPointerMove={() => !option.disabled && setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {index === selected && <Icon name="check" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && isoDate(date) === value
    ? date
    : null;
}

export function DateField({
  label,
  value,
  onChange,
  name,
  disabled,
  ...props
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parseDate(value) || new Date());
  const trigger = useRef(null);
  const panel = useRef(null);
  const position = useOverlay(open, trigger, panel, () => setOpen(false), 328);
  const calendarId = useId();
  const year = cursor.getFullYear(),
    month = cursor.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay();
  useEffect(() => {
    // The first layout pass measures a hidden overlay; focus only after it is shown.
    if (open && position.visibility === "visible")
      panel.current?.querySelector('[tabindex="0"]')?.focus();
  }, [open, cursor, position.visibility]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function setDate(date) {
    onChange?.({ target: { value: isoDate(date), name } });
    close();
  }
  function dayKey(event) {
    const change = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    if (change !== undefined) {
      event.preventDefault();
      setCursor(new Date(year, month, cursor.getDate() + change));
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setCursor(
        new Date(
          year,
          month,
          cursor.getDate() +
            (event.key === "Home" ? -cursor.getDay() : 6 - cursor.getDay()),
        ),
      );
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      setCursor(new Date(year, month + (event.key === "PageUp" ? -1 : 1), 1));
    }
  }
  return (
    <>
      <TextField
        {...props}
        name={name}
        label={label}
        type="text"
        inputMode="numeric"
        pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
        placeholder="YYYY-MM-DD"
        value={value}
        onChange={onChange}
        disabled={disabled}
        trailing={
          <button
            type="button"
            className="icon-button"
            ref={trigger}
            aria-label={`${label} 달력 열기`}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => {
              setCursor(parseDate(value) || new Date());
              setOpen(!open);
            }}
          >
            <Icon name="calendar_month" />
          </button>
        }
      />
      {open &&
        createPortal(
          <div
            ref={panel}
            className="md-menu md-calendar"
            role="dialog"
            aria-modal="true"
            aria-labelledby={calendarId}
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
              if (event.key === "Tab") {
                const controls = [
                  ...panel.current.querySelectorAll("button:not([disabled])"),
                ].filter((button) => button.tabIndex !== -1);
                if (event.shiftKey && document.activeElement === controls[0]) {
                  event.preventDefault();
                  controls.at(-1).focus();
                } else if (
                  !event.shiftKey &&
                  document.activeElement === controls.at(-1)
                ) {
                  event.preventDefault();
                  controls[0].focus();
                }
              }
            }}
          >
            <div className="md-calendar-heading">
              <strong id={calendarId} aria-live="polite">
                {year}년 {month + 1}월
              </strong>
              <button
                type="button"
                className="icon-button"
                aria-label="이전 달"
                onClick={() => setCursor(new Date(year, month - 1, 1))}
              >
                <Icon name="chevron_left" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="다음 달"
                onClick={() => setCursor(new Date(year, month + 1, 1))}
              >
                <Icon name="chevron_right" />
              </button>
            </div>
            <div className="md-calendar-grid">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <span className="md-weekday" key={day}>
                  {day}
                </span>
              ))}
              {Array.from({ length: offset }, (_, index) => (
                <span key={`empty-${index}`} />
              ))}
              {Array.from({ length: days }, (_, index) => {
                const date = new Date(year, month, index + 1),
                  iso = isoDate(date);
                return (
                  <button
                    key={iso}
                    type="button"
                    tabIndex={cursor.getDate() === index + 1 ? 0 : -1}
                    aria-label={iso}
                    aria-pressed={value === iso}
                    aria-current={
                      isoDate(new Date()) === iso ? "date" : undefined
                    }
                    onKeyDown={dayKey}
                    onClick={() => setDate(date)}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="text-button"
                onClick={() => setDate(new Date())}
              >
                오늘
              </button>
              <button type="button" className="text-button" onClick={close}>
                닫기
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
