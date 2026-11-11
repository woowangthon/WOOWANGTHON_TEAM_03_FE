import { useEffect, useRef, useState } from "react";
import { requestApi } from "../api/services.js";
import { describeApiError } from "../api/http.js";

const pollingStates = new Set([
  "queued",
  "analyzing",
  "processing",
  "awaiting_approval",
]);
const processingStates = new Set(["queued", "analyzing", "processing"]);
const automaticWaitLimit = 5 * 60 * 1000;

/** One read at a time; mutations and navigation invalidate older reads. */
export function useRequestStatus(auth, id, onHistoryChange) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState({ seconds: 0, paused: false });
  const [version, setVersion] = useState(0);
  const stop = useRef(() => {});
  const lastState = useRef(null);
  const latest = useRef({ auth, onHistoryChange });
  latest.current = { auth, onHistoryChange };

  useEffect(() => {
    let active = true,
      timer,
      deadline,
      waitTimer,
      controller;
    let waitStarted = null;
    setLoading(true);
    setError("");
    setWaiting({ seconds: 0, paused: false });
    const pause = () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      clearTimeout(waitTimer);
      document.removeEventListener("visibilitychange", updateWait);
      controller?.abort();
    };
    stop.current = pause;
    function updateWait() {
      if (!active || waitStarted === null) return;
      clearTimeout(waitTimer);
      const elapsed = Math.max(0, performance.now() - waitStarted);
      if (elapsed >= automaticWaitLimit) {
        pause();
        setWaiting({ seconds: 300, paused: true });
        setLoading(false);
        return;
      }
      setWaiting({ seconds: Math.floor(elapsed / 1000), paused: false });
      waitTimer = setTimeout(
        updateWait,
        Math.min(1000, automaticWaitLimit - elapsed),
      );
    }
    async function read() {
      if (
        waitStarted !== null &&
        performance.now() - waitStarted >= automaticWaitLimit
      ) {
        updateWait();
        return;
      }
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
        if (processingStates.has(next.state)) {
          if (waitStarted === null) {
            waitStarted = performance.now();
            updateWait();
          }
        } else {
          waitStarted = null;
          clearTimeout(waitTimer);
          setWaiting({ seconds: 0, paused: false });
        }
        if (lastState.current !== next.state) {
          lastState.current = next.state;
          latest.current.onHistoryChange();
        }
        if (active && pollingStates.has(next.state))
          timer = setTimeout(read, 2000);
      } catch (err) {
        if (!active) return;
        clearTimeout(waitTimer);
        waitStarted = null;
        setWaiting({ seconds: 0, paused: false });
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
    document.addEventListener("visibilitychange", updateWait);
    read();
    return pause;
  }, [id, version]);

  return {
    data,
    loading,
    error,
    waiting,
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
