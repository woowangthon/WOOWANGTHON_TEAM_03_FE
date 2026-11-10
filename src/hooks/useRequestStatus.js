import { useEffect, useRef, useState } from "react";
import { requestApi } from "../api/services.js";
import { describeApiError } from "../api/http.js";

const pollingStates = new Set([
  "queued",
  "analyzing",
  "processing",
  "awaiting_approval",
]);

/** One read at a time; mutations and navigation invalidate older reads. */
export function useRequestStatus(auth, id, onHistoryChange) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const stop = useRef(() => {});
  const lastState = useRef(null);
  const latest = useRef({ auth, onHistoryChange });
  latest.current = { auth, onHistoryChange };

  useEffect(() => {
    let active = true,
      timer,
      deadline,
      controller;
    setLoading(true);
    setError("");
    const pause = () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller?.abort();
    };
    stop.current = pause;
    async function read() {
      controller = new AbortController();
      let timedOut = false;
      deadline = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15000);
      try {
        const currentAuth = latest.current.auth;
        const next = await currentAuth.run(() =>
          requestApi.get(currentAuth.user, id, { signal: controller.signal }),
        );
        if (!active) return;
        setData(next);
        setError("");
        if (lastState.current !== next.state) {
          lastState.current = next.state;
          latest.current.onHistoryChange();
        }
        if (pollingStates.has(next.state)) timer = setTimeout(read, 2000);
      } catch (err) {
        if (!active) return;
        // Never retain an original PDF or actionable stale record after denial.
        setData(null);
        setError(
          timedOut
            ? "상태 조회 응답이 늦어 자동 조회를 멈췄습니다. 처리가 실패했다는 뜻은 아닙니다. 상태를 다시 조회해 주세요."
            : `${describeApiError(err)} 자동 조회를 멈췄습니다. 처리 결과는 상태 다시 조회로 확인해 주세요.`,
        );
      } finally {
        clearTimeout(deadline);
        if (active) setLoading(false);
      }
    }
    read();
    return pause;
  }, [id, version]);

  return {
    data,
    loading,
    error,
    pause: () => stop.current(),
    accept: (next) => {
      setData(next);
      setError("");
    },
    clear: () => setData(null),
    refresh: () => {
      stop.current();
      setLoading(true);
      setVersion((v) => v + 1);
    },
  };
}
