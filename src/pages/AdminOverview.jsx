import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { adminApi, requestApi } from "../api/services.js";
import { describeApiError } from "../api/http.js";
import {
  adminMetrics,
  detectionLabels,
  inspectionLabels,
  recentPeriod,
  routeLabels,
  validatePeriod,
} from "../api/admin.js";
import { requestStateLabel, requestStateLabels } from "../api/requests.js";
import { Empty, Notice, Spinner } from "../components/Common.jsx";

const time = (value) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "미기록";
const count = (value) =>
  value == null ? "미확정" : `${value.toLocaleString()}건`;
const statusLabels = {
  pending: "대기",
  approved: "승인",
  rejected: "거절",
  expired: "만료",
  not_sent: "미전송",
  unknown: "전송 여부 불명",
  confirmed_sent: "외부 전송 확인",
  uploading: "업로드 중",
  extracting: "추출 중",
  ready: "추출 완료",
  failed: "실패",
};
const status = (value) => statusLabels[value] || value || "미기록";
function MetricValue({ metric }) {
  if (metric.status === "complete")
    return (
      <>
        <strong>
          {metric.value.toLocaleString()}
          <small>건</small>
        </strong>
        <span className="fine-print">확정 집계</span>
      </>
    );
  return (
    <>
      <strong className="metric-unknown">
        {metric.status === "partial" ? "부분 집계" : "집계 불가"}
      </strong>
      <span className="fine-print">
        확인된 값 {metric.known_value}건 · 미확정 요청{" "}
        {metric.unknown_request_count}건
      </span>
    </>
  );
}
function DailyChart({ data }) {
  const [key, setKey] = useState("total_requests");
  const label = adminMetrics.find(([id]) => id === key)[1];
  const max = Math.max(1, ...data.map((day) => day.metrics[key].known_value));
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>일별 추이</h2>
        <select
          aria-label="차트 지표"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        >
          {adminMetrics.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <p className="fine-print">
        요청 생성일 기준 · 한국 시간. 부분 집계의 막대는 확인된 값만 표시합니다.
      </p>
      <div className="audit-chart" role="img" aria-label={`${label} 일별 추이`}>
        {data.map((day) => {
          const metric = day.metrics[key];
          const known = metric.status !== "unavailable";
          return (
            <div
              className="audit-bar-column"
              key={day.date}
              aria-label={`${day.date}: ${metric.status === "complete" ? count(metric.value) : `${metric.status === "partial" ? "부분 집계" : "집계 불가"}, 확인 ${metric.known_value}건, 미확정 요청 ${metric.unknown_request_count}건`}`}
            >
              <span>
                {known
                  ? `${metric.known_value}${metric.status === "partial" ? "+?" : ""}`
                  : "미확정"}
              </span>
              <div className="audit-bar-track">
                {known ? (
                  <div
                    className={`bar ${metric.status}`}
                    style={{ height: `${(metric.known_value / max) * 100}%` }}
                  />
                ) : (
                  <div className="unavailable-bar">?</div>
                )}
              </div>
              <small>{day.date.slice(5)}</small>
            </div>
          );
        })}
      </div>
      <details>
        <summary>일별 수치 표</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>{label}</th>
                <th>집계 상태</th>
              </tr>
            </thead>
            <tbody>
              {data.map((day) => (
                <tr key={day.date}>
                  <td>{day.date}</td>
                  <td>{count(day.metrics[key].value)}</td>
                  <td>
                    {day.metrics[key].status === "complete"
                      ? "확정"
                      : `확인 ${day.metrics[key].known_value}건 · 미확정 요청 ${day.metrics[key].unknown_request_count}건`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
function AuditDetail({ id, close, onForbidden }) {
  const auth = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [version, setVersion] = useState(0);
  const [pdf, setPdf] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const alive = useRef(false);
  const fileUrl = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setBusy(true);
    setData(null);
    setError("");
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    fileUrl.current = null;
    setPdf(null);
    auth
      .run(() => adminApi.detail(auth.user, id, { signal: controller.signal }))
      .then((next) => {
        if (active) setData(next);
      })
      .catch((err) => {
        if (active) {
          if (err.code === "FORBIDDEN") onForbidden();
          else if (err.name !== "AbortError") setError(describeApiError(err));
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, version]);
  async function loadPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    setError("");
    try {
      const blob = await auth.run(() => requestApi.file(auth.user, id));
      if (!alive.current) return;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = URL.createObjectURL(blob);
      setPdf(fileUrl.current);
    } catch (err) {
      if (alive.current) {
        if (err.code === "FORBIDDEN") onForbidden();
        else setError(describeApiError(err));
      }
    } finally {
      if (alive.current) setPdfBusy(false);
    }
  }
  return (
    <section className="panel audit-detail" aria-label="요청 감사 상세">
      <div className="panel-title">
        <h2>요청 감사 상세</h2>
        <div className="table-actions">
          <button
            disabled={busy || pdfBusy}
            onClick={() => setVersion((v) => v + 1)}
          >
            상세 다시 조회
          </button>
          <button onClick={close}>상세 닫기</button>
        </div>
      </div>
      <p className="fine-print request-id">접수 번호 {id}</p>
      <Notice kind="error">{error}</Notice>
      {busy && <Spinner />}
      {data && (
        <>
          <p>
            {data.user.full_name} · {data.user.username} ·{" "}
            {data.user.is_active ? "활성 계정" : "비활성 계정"}
          </p>
          <div className="audit-facts">
            <p>
              <b>요청 상태</b>
              {requestStateLabel(data.state)}
            </p>
            <p>
              <b>처리 경로</b>
              {routeLabels[data.processing_route] || "미결정"}
            </p>
            <p>
              <b>검사 상태</b>
              {inspectionLabels[data.inspection_status] || "확인 필요"}
            </p>
            <p>
              <b>탐지 구간</b>
              {count(data.detection_count)}
            </p>
            <p>
              <b>접수</b>
              {time(data.created_at)}
            </p>
            <p>
              <b>최근 변경</b>
              {time(data.updated_at)}
            </p>
            <p>
              <b>종료</b>
              {time(data.finished_at)}
            </p>
            <p>
              <b>사용자 숨김</b>
              {time(data.hidden_at)}
            </p>
            <p>
              <b>전송 승인</b>
              {status(data.approval.status)}
            </p>
            <p>
              <b>승인 만료 시각</b>
              {time(data.approval.expires_at)}
            </p>
            <p>
              <b>승인 결정 시각</b>
              {time(data.approval.decided_at)}
            </p>
            <p>
              <b>실제 전송 상태</b>
              {status(data.delivery.status)}
            </p>
            <p>
              <b>외부 전송 시작</b>
              {time(data.delivery.external_send_started_at)}
            </p>
            <p>
              <b>실패 단계·코드</b>
              {data.failure.stage || "미기록"} · {data.failure.code || "미기록"}
            </p>
          </div>
          <p className="fine-print">
            경고 코드:{" "}
            {data.warning_codes.length
              ? data.warning_codes.join(", ")
              : "기록 없음"}
          </p>
          {!data.detection_is_final && (
            <Notice kind="warning">
              검사가 완료되지 않았습니다. 저장된 탐지 구간이 있어도 확정 결과가
              아닙니다.
            </Notice>
          )}
          <details>
            <summary>요청문·검사 원문 보기</summary>
            <h3>요청문</h3>
            <pre>{data.instruction || "입력 없음"}</pre>
            <h3>전체 검사문</h3>
            <pre>{data.input_text || "미수집"}</pre>
          </details>
          {data.document && (
            <details>
              <summary>원본 PDF·추출문 보기</summary>
              <p className="file-name">
                {data.document.original_filename} ·{" "}
                {data.document.page_count ?? "미확인"}쪽 ·{" "}
                {data.document.size_bytes ?? "미확인"}바이트 ·{" "}
                {status(data.document.extraction_status)}
              </p>
              <button onClick={loadPdf} disabled={busy || pdfBusy}>
                {pdfBusy ? "PDF 읽는 중…" : "감사용 PDF 열기"}
              </button>
              {pdf && (
                <>
                  <a
                    className="pdf-download"
                    href={pdf}
                    download={data.document.original_filename}
                  >
                    PDF 다운로드
                  </a>
                  <object
                    className="pdf-preview"
                    data={pdf}
                    type="application/pdf"
                    aria-label="감사용 원본 PDF"
                  >
                    <p>
                      이 브라우저에서는 PDF 미리보기를 지원하지 않습니다.
                      다운로드로 확인해 주세요.
                    </p>
                  </object>
                </>
              )}
              <h3>추출문</h3>
              <pre>
                {data.document.extracted_text || "아직 추출문이 없습니다."}
              </pre>
            </details>
          )}
          <details>
            <summary>탐지 구간·가림 대응표 보기</summary>
            <p className="fine-print">
              위치는 전체 검사문 기준 저장값입니다. 문자 단위 합의 전에는 본문
              하이라이트로 변환하지 않습니다.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>분류</th>
                    <th>원값</th>
                    <th>입력 출처</th>
                    <th>시작 → 끝</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detection_spans.map((span) => (
                    <tr key={span.id}>
                      <td>{detectionLabels[span.label] || span.label}</td>
                      <td>{span.value}</td>
                      <td>
                        {span.input_source === "pdf"
                          ? "PDF"
                          : span.input_source === "instruction"
                            ? "요청문"
                            : "미확인"}
                      </td>
                      <td>
                        {span.start_offset} → {span.end_offset}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.detection_spans.length && (
              <p>저장된 탐지 구간이 없습니다.</p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>분류</th>
                    <th>원값</th>
                    <th>자리표</th>
                  </tr>
                </thead>
                <tbody>
                  {data.masking_mappings.map((mapping) => (
                    <tr key={mapping.id}>
                      <td>{detectionLabels[mapping.label] || mapping.label}</td>
                      <td>{mapping.value}</td>
                      <td>{mapping.placeholder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.masking_mappings.length && (
              <p>저장된 가림 대응표가 없습니다.</p>
            )}
          </details>
          <p className="fine-print">
            감사 목적으로 허용된 입력 자료만 조회합니다. 타인의 AI 답변과 AI
            실행·승인 기능은 제공하지 않습니다.
          </p>
        </>
      )}
    </section>
  );
}

export default function AdminOverview() {
  const auth = useAuth();
  const [draft, setDraft] = useState(() => ({
    ...recentPeriod(),
    q: "",
    state: "",
    processing_route: "",
    detection_label: "",
    request_id: "",
    user_id: "",
  }));
  const [query, setQuery] = useState(() => ({
    filters: draft,
    page: 1,
    page_size: 20,
  }));
  const [validation, setValidation] = useState("");
  const [stats, setStats] = useState(null);
  const [list, setList] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(true);
  const [version, setVersion] = useState(0);
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState(null);
  const [lastSuccess, setLastSuccess] = useState(null);
  function deny() {
    setForbidden(true);
    setStats(null);
    setList(null);
    setSelected(null);
  }
  useEffect(() => {
    if (forbidden) return;
    let active = true;
    let timer;
    const controller = new AbortController();
    setStats(null);
    setList(null);
    setSelected(null);
    setLastSuccess(null);
    async function load() {
      setBusy(true);
      setErrors({});
      const options = { signal: controller.signal };
      const read = (operation) =>
        auth.run(operation).catch((error) => {
          // Permission loss must hide data immediately, even if the other read stalls.
          if (active && error.code === "FORBIDDEN") {
            active = false;
            controller.abort();
            clearTimeout(timer);
            deny();
            setBusy(false);
          }
          throw error;
        });
      const results = await Promise.allSettled([
        read(() => adminApi.statistics(auth.user, query.filters, options)),
        read(() =>
          adminApi.list(auth.user, query.filters, {
            ...options,
            page: query.page,
            page_size: query.page_size,
          }),
        ),
      ]);
      if (!active) return;
      const nextErrors = {};
      for (const [index, key] of ["stats", "list"].entries()) {
        const result = results[index];
        const setter = key === "stats" ? setStats : setList;
        if (result.status === "fulfilled") setter(result.value);
        else {
          setter(null);
          nextErrors[key] = describeApiError(result.reason);
        }
      }
      setErrors(nextErrors);
      setBusy(false);
      if (!Object.keys(nextErrors).length)
        setLastSuccess(new Date().toISOString());
      // Schedule after both reads finish: no overlapping automatic refreshes.
      timer = setTimeout(load, 30000);
    }
    load();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, version, forbidden]);
  function apply(event) {
    event.preventDefault();
    const error = validatePeriod(draft);
    setValidation(error);
    if (!error)
      setQuery({ filters: { ...draft }, page: 1, page_size: query.page_size });
  }
  function field(key, label, options) {
    return (
      <label key={key}>
        {label}
        <select
          aria-label={label}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        >
          <option value="">전체</option>
          {Object.entries(options).map(([value, text]) => (
            <option value={value} key={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (forbidden)
    return (
      <section>
        <Notice kind="error">
          관리자 조회 권한이 없습니다. 이전 조회 자료를 닫았습니다. 권한을
          확인한 뒤 다시 조회해 주세요.
        </Notice>
        <button
          onClick={() => {
            setForbidden(false);
            setVersion((v) => v + 1);
          }}
        >
          권한 다시 확인
        </button>
      </section>
    );
  return (
    <div className="admin-overview">
      <form className="panel audit-filters" onSubmit={apply}>
        <div className="panel-title">
          <h2>조회 조건</h2>
          <div className="table-actions">
            {[1, 7, 30].map((days) => (
              <button
                type="button"
                key={days}
                onClick={() => {
                  const next = { ...draft, ...recentPeriod(days) };
                  setDraft(next);
                  setValidation("");
                  setQuery({
                    filters: next,
                    page: 1,
                    page_size: query.page_size,
                  });
                }}
              >
                최근 {days}일
              </button>
            ))}
          </div>
        </div>
        <div className="audit-filter-grid">
          <label>
            시작일
            <input
              type="date"
              required
              value={draft.date_from}
              onChange={(e) =>
                setDraft({ ...draft, date_from: e.target.value })
              }
            />
          </label>
          <label>
            종료일
            <input
              type="date"
              required
              value={draft.date_to}
              onChange={(e) => setDraft({ ...draft, date_to: e.target.value })}
            />
          </label>
          <label className="audit-search">
            이용자·파일명 검색
            <input
              maxLength={100}
              placeholder="로그인 ID, 이름 또는 파일명"
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            />
          </label>
          {field("state", "요청 상태", requestStateLabels)}
          {field("processing_route", "처리 경로", routeLabels)}
          {field("detection_label", "탐지 분류", detectionLabels)}
        </div>
        <details>
          <summary>접수·사용자 번호로 검색</summary>
          <div className="audit-filter-grid">
            {[
              ["request_id", "접수 번호"],
              ["user_id", "사용자 번호"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  placeholder="UUID 전체 입력"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <Notice kind="error">{validation}</Notice>
        <button className="primary">조건 적용</button>
        <p className="fine-print">
          요청문 본문은 검색하지 않습니다. 경고·검사 이상 전용 필터는 아직
          제공되지 않습니다.
        </p>
      </form>
      <div className="audit-refresh">
        <div>
          <b>
            {query.filters.date_from} ~ {query.filters.date_to}
          </b>
          <p className="fine-print">
            한국 시간의 요청 생성일 기준 · 조회 완료 후 30초마다 갱신
            <br />
            최근 전체 조회 성공: {time(lastSuccess)}
            {busy ? " · 갱신 중…" : ""}
          </p>
        </div>
        <button disabled={busy} onClick={() => setVersion((v) => v + 1)}>
          새로고침
        </button>
      </div>
      {busy && !stats && !list && <Spinner>이용 현황을 불러오는 중</Spinner>}
      <Notice kind="error">
        {errors.stats && `통계 조회 실패: ${errors.stats}`}
      </Notice>
      {stats && (
        <>
          <div className="metrics">
            {adminMetrics.map(([key, label]) => (
              <div className="metric" key={key} data-testid={`metric-${key}`}>
                <span>{label}</span>
                <MetricValue metric={stats.summary.metrics[key]} />
              </div>
            ))}
          </div>
          <p className="fine-print">
            집계 시각: {time(stats.calculated_at)} · 검사 대기{" "}
            {stats.summary.coverage.inspection_pending_requests ?? "미확인"}건 ·
            전송 여부 불명{" "}
            {stats.summary.coverage.external_delivery_unknown_requests ??
              "미확인"}
            건<br />
            정책 차단은 거절·만료를 포함하지 않습니다. 외부 경로 판정이나
            승인만으로 전송 완료를 계산하지 않습니다.
          </p>
          <DailyChart data={stats.daily} />
        </>
      )}
      <section className="panel" aria-label="관리자 요청 목록">
        <div className="panel-title">
          <h2>요청 감사 목록</h2>
          <label>
            페이지당
            <select
              aria-label="감사 목록 페이지 크기"
              value={query.page_size}
              onChange={(e) =>
                setQuery({
                  ...query,
                  page: 1,
                  page_size: Number(e.target.value),
                })
              }
            >
              {[10, 20, 50].map((value) => (
                <option key={value} value={value}>
                  {value}건
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="fine-print">
          최근 접수 순 · 숨긴 요청과 비활성 계정의 이력도 포함합니다. 분류
          필터를 적용해도 각 요청의 탐지 수는 모든 분류의 합계입니다.
        </p>
        <Notice kind="error">
          {errors.list && `목록 조회 실패: ${errors.list}`}
        </Notice>
        {list &&
          (list.results.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>접수·이용자</th>
                    <th>입력</th>
                    <th>상태·경로</th>
                    <th>검사·탐지</th>
                    <th>경고·오류</th>
                    <th>감사</th>
                  </tr>
                </thead>
                <tbody>
                  {list.results.map((row) => (
                    <tr key={row.request_id}>
                      <td>
                        {time(row.created_at)}
                        <br />
                        {row.user.full_name} · {row.user.username}
                        <small className="request-id">{row.request_id}</small>
                      </td>
                      <td className="file-name">
                        {row.original_filename || "요청문"}
                      </td>
                      <td>
                        {requestStateLabel(row.state)}
                        <br />
                        {routeLabels[row.processing_route] || "경로 미결정"}
                      </td>
                      <td>
                        {inspectionLabels[row.inspection_status] || "확인 필요"}
                        <br />
                        {count(row.detection_count)}
                        <small>
                          {row.detection_labels
                            ?.map((label) => detectionLabels[label] || label)
                            .join(", ")}
                        </small>
                      </td>
                      <td>
                        {row.warning_codes.length
                          ? row.warning_codes.join(", ")
                          : "경고 기록 없음"}
                        <br />
                        {row.error_code || ""}
                      </td>
                      <td>
                        <button
                          aria-label={`${row.request_id} 상세 보기`}
                          onClick={() => setSelected(row.request_id)}
                        >
                          상세 보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="해당하는 요청이 없습니다">
              기간이나 검색 조건을 바꿔 보세요.
            </Empty>
          ))}
        {list && (
          <div className="pagination">
            <span>전체 {list.count}건</span>
            <button
              disabled={busy || !list.previous_page}
              onClick={() => setQuery({ ...query, page: list.previous_page })}
            >
              이전
            </button>
            <span>
              {list.page} / {list.total_pages}페이지
            </span>
            <button
              disabled={busy || !list.next_page}
              onClick={() => setQuery({ ...query, page: list.next_page })}
            >
              다음
            </button>
          </div>
        )}
      </section>
      {selected && (
        <AuditDetail
          key={selected}
          id={selected}
          close={() => setSelected(null)}
          onForbidden={deny}
        />
      )}
    </div>
  );
}
