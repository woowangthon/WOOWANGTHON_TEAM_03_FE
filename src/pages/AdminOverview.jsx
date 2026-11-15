import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { adminApi, requestApi, requestMode } from "../api/services.js";
import { describeApiError } from "../api/http.js";
import {
  adminMetrics,
  detectionLabels,
  inspectionLabels,
  recentPeriod,
  routeLabels,
  validatePeriod,
  warningLabel,
  failureLabel,
  failureStageLabel,
} from "../api/admin.js";
import { requestStateLabel, requestStateLabels } from "../api/requests.js";
import { Empty, Notice, Spinner } from "../components/Common.jsx";
import { DateField, Select, TextField } from "../components/Material.jsx";
import Icon from "../components/Icon.jsx";
import { useAdminBack, useAdminScroll } from "./AdminNavigation.js";

const time = (value) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "미기록";
const count = (value, unit = "건") =>
  value == null ? "미확정" : `${value.toLocaleString()}${unit}`;
const warningText = (record) =>
  record.warning_codes.length
    ? record.warning_codes.map(warningLabel).join(" ")
    : record.inspection_status === "complete"
      ? "경고 없음"
      : "경고 미확정";
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

const confirmedCountCards = new Set([
  "detection_count",
  "warning_requests",
  "inspection_anomalies",
]);

function MetricValue({ metric, unit = "건", confirmedOnly }) {
  if (confirmedOnly || metric.status === "complete")
    return (
      <strong>
        {confirmedOnly ? metric.known_value : metric.value.toLocaleString()}
        <small>{unit}</small>
      </strong>
    );
  return (
    <>
      <strong className="metric-unknown">
        {metric.status === "partial" ? "부분 집계" : "집계 불가"}
      </strong>
      <span className="fine-print">
        확인된 값 {metric.known_value}
        {unit} · 미확정 요청 {metric.unknown_request_count}건
      </span>
    </>
  );
}

function DailyChart({ data }) {
  const descriptionId = useId();
  const chart = useRef(null);
  const dates = data.map((day) => day.date).join(",");
  useLayoutEffect(() => {
    if (chart.current) chart.current.scrollLeft = chart.current.scrollWidth;
  }, [dates]);
  const [key, setKey] = useState("total_requests");
  const unit = key === "detection_count" ? "곳" : "건";
  const label = adminMetrics.find(([id]) => id === key)[1];
  const max = Math.max(1, ...data.map((day) => day.metrics[key].known_value));
  const hasUncertain = data.some(
    (day) => day.metrics[key].status !== "complete",
  );
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>일별 추이</h2>
        <Select
          aria-label="차트 지표"
          value={key}
          onChange={(event) => setKey(event.target.value)}
        >
          {adminMetrics.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      {hasUncertain && (
        <p className="fine-print">
          부분 집계는 확인된 값만 표시하며, 미확정 값은 0건이 아닙니다.
        </p>
      )}
      <p className="sr-only" id={descriptionId}>
        {data
          .map((day) => {
            const metric = day.metrics[key];
            return `${day.date}: ${metric.status === "complete" ? count(metric.value, unit) : `${metric.status === "partial" ? "부분 집계" : "집계 불가"}, 확인 ${metric.known_value}${unit}, 미확정 요청 ${metric.unknown_request_count}건`}`;
          })
          .join(". ")}
      </p>
      <div
        ref={chart}
        className="audit-chart"
        role="img"
        aria-label={`${label} 일별 추이`}
        aria-describedby={descriptionId}
      >
        {data.map((day) => {
          const metric = day.metrics[key];
          const known = metric.status !== "unavailable";
          const description = `${day.date}: ${metric.status === "complete" ? count(metric.value, unit) : `${metric.status === "partial" ? "부분 집계" : "집계 불가"}, 확인 ${metric.known_value}${unit}, 미확정 요청 ${metric.unknown_request_count}건`}`;
          return (
            <div
              className="audit-bar-column"
              key={day.date}
              aria-label={description}
              title={description}
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
    </section>
  );
}

const exampleId = "00000000-0000-4000-8000-000000000001";
function exampleRequest() {
  return {
    request_id: exampleId,
    created_at: `${recentPeriod().date_to}T01:30:00Z`,
    finished_at: null,
    user: {
      id: "example-1",
      username: "USER0001",
      full_name: "가상 사용자 하나",
      is_active: true,
    },
    state: "blocked",
    processing_route: "blocked",
    inspection_status: "complete",
    detection_count: 2,
    detection_labels: ["company"],
    warning_codes: [],
    error_code: null,
    original_filename: null,
    instruction: "가상 감사 요청입니다.",
    input_text: "가상 입력문입니다.",
    updated_at: null,
    hidden_at: null,
    document: null,
    detection_is_final: true,
    detection_spans: [],
    masking_mappings: [],
    approval: {},
    delivery: { status: "not_sent" },
    failure: {},
  };
}
function exampleStatistics(filters) {
  const metric = (value) => ({
    value,
    known_value: value,
    unknown_request_count: 0,
    status: "complete",
  });
  const included = exampleList({ filters, page: 1, page_size: 20 }).count;
  const values = [included, included * 2, 0, 0, included, 0];
  const metrics = Object.fromEntries(
    adminMetrics.map(([key], index) => [key, metric(values[index])]),
  );
  const daily = [];
  for (
    let stamp = Date.parse(filters.date_from);
    stamp <= Date.parse(filters.date_to);
    stamp += 86400000
  ) {
    const date = new Date(stamp).toISOString().slice(0, 10);
    const isRequestDay = date === exampleRequest().created_at.slice(0, 10);
    const dayValues = Object.fromEntries(
      adminMetrics.map(([key], index) => [
        key,
        metric(isRequestDay ? values[index] : 0),
      ]),
    );
    daily.push({
      date,
      metrics: dayValues,
    });
  }
  return {
    summary: { metrics },
    daily,
    calculated_at: new Date().toISOString(),
  };
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
    Promise.resolve()
      .then(() =>
        requestMode === "mock"
          ? id === exampleId
            ? exampleRequest()
            : Promise.reject(new Error("요청을 찾을 수 없습니다."))
          : auth.run(() =>
              adminApi.detail(auth.user, id, { signal: controller.signal }),
            ),
      )
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
    <section className="panel audit-detail" aria-label="요청 검사 상세">
      <div className="panel-title">
        <h1>요청 검사 상세</h1>
        <div className="table-actions">
          <button
            disabled={busy || pdfBusy}
            onClick={() => setVersion((v) => v + 1)}
          >
            상세 다시 조회
          </button>
          <button className="text-button page-back" onClick={close}>
            뒤로가기
          </button>
        </div>
      </div>

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
              {failureStageLabel(data.failure.stage)} ·{" "}
              {failureLabel(data.failure.code)}
            </p>
          </div>
          <p className="fine-print">{warningText(data)}</p>
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
              <button
                className="secondary"
                onClick={loadPdf}
                disabled={busy || pdfBusy}
              >
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

export function AdminAuditDetail() {
  const { requestId } = useParams();
  const back = useAdminBack("/admin/audit");
  const [forbidden, setForbidden] = useState(false);
  useAdminScroll();
  useEffect(() => setForbidden(false), [requestId]);
  return (
    <div className="page-content detail-page">
      {forbidden ? (
        <>
          <button className="text-button page-back" onClick={back}>
            뒤로가기
          </button>
          <Notice kind="error">
            관리자 조회 권한이 없습니다. 이전 조회 자료를 닫았습니다.
          </Notice>
          <button className="secondary" onClick={() => setForbidden(false)}>
            권한 다시 확인
          </button>
        </>
      ) : (
        <AuditDetail
          key={requestId}
          id={requestId}
          close={back}
          onForbidden={() => setForbidden(true)}
        />
      )}
    </div>
  );
}

const filterKeys = [
  "q",
  "state",
  "processing_route",
  "detection_label",
  "has_warnings",
  "inspection_status",
  "inspection_anomaly",
  "user_id",
];
function readQuery(search) {
  const params = new URLSearchParams(search);
  const recent = recentPeriod();
  const filters = {
    date_from: params.get("date_from") || recent.date_from,
    date_to: params.get("date_to") || recent.date_to,
    ...Object.fromEntries(
      filterKeys.map((key) => [key, params.get(key) || ""]),
    ),
  };
  const page = Number(params.get("page"));
  const size = Number(params.get("page_size"));
  return {
    filters,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    page_size: [10, 20, 50].includes(size) ? size : 20,
  };
}
function queryParams(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query.filters))
    if (value) params.set(key, value);
  if (query.page > 1) params.set("page", query.page);
  if (query.page_size !== 20) params.set("page_size", query.page_size);
  return params;
}

function AuditFilters({ query, onApply }) {
  const [expanded, setExpanded] = useState(false);
  const filterId = useId();
  const [draft, setDraft] = useState(query.filters);
  const [validation, setValidation] = useState("");
  useEffect(() => {
    setDraft(query.filters);
    setValidation("");
  }, [query]);
  const change = (key) => (event) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));
  function apply(event) {
    event.preventDefault();
    const error = validatePeriod(draft);
    setValidation(error);
    if (!error) onApply({ ...query, filters: { ...draft }, page: 1 });
  }
  const field = (key, label, options) => (
    <Select key={key} label={label} value={draft[key]} onChange={change(key)}>
      <option value="">전체</option>
      {Object.entries(options).map(([value, text]) => (
        <option value={value} key={value}>
          {text}
        </option>
      ))}
    </Select>
  );
  return (
    <section className="audit-filter-section">
      <div className="panel-title">
        <button
          type="button"
          className="icon-button filter-toggle"
          aria-label="조회 조건"
          title="조회 조건"
          aria-expanded={expanded}
          aria-controls={filterId}
          onClick={() => setExpanded(!expanded)}
        >
          <Icon name="filter_list" />
        </button>
        <div className="period-presets" role="group" aria-label="조회 기간">
          {[1, 7, 30].map((days) => {
            const period = recentPeriod(days);
            const selected =
              draft.date_from === period.date_from &&
              draft.date_to === period.date_to;
            return (
              <button
                type="button"
                key={days}
                aria-pressed={selected}
                onClick={() => {
                  const next = { ...draft, ...period };
                  setDraft(next);
                  setValidation("");
                  onApply({ ...query, filters: next, page: 1 });
                }}
              >
                최근 {days}일
              </button>
            );
          })}
        </div>
      </div>
      {expanded && (
        <form id={filterId} className="panel audit-filters" onSubmit={apply}>
          <div className="audit-filter-grid">
            <DateField
              label="시작일"
              required
              value={draft.date_from}
              onChange={change("date_from")}
            />
            <DateField
              label="종료일"
              required
              value={draft.date_to}
              onChange={change("date_to")}
            />
            <TextField
              className="audit-search"
              label="이용자·파일명 검색"
              maxLength={100}
              placeholder="로그인 ID, 이름 또는 파일명"
              value={draft.q}
              onChange={change("q")}
            />
            {field("state", "요청 상태", requestStateLabels)}
            {field("processing_route", "처리 경로", routeLabels)}
            {field("detection_label", "탐지 분류", detectionLabels)}
            {field("has_warnings", "경고 여부", {
              true: "있음",
              false: "없음 · 검사 완료",
            })}
            {field("inspection_status", "검사 상태", inspectionLabels)}
            {field("inspection_anomaly", "검사 이상", {
              true: "이상 · 불완전 검사 또는 실패",
              false: "정상 · 검사 완료",
            })}
          </div>
          <details>
            <summary>사용자 번호로 검색</summary>
            <TextField
              label="사용자 번호"
              placeholder="UUID 전체 입력"
              value={draft.user_id}
              onChange={change("user_id")}
            />
          </details>
          <Notice kind="error">{validation}</Notice>
          <button className="primary">조건 적용</button>
        </form>
      )}
    </section>
  );
}

function exampleList(query) {
  const row = exampleRequest();
  const filters = query.filters;
  const matches =
    (!filters.q ||
      `${row.user.username} ${row.user.full_name}`
        .toLowerCase()
        .includes(filters.q.toLowerCase())) &&
    (!filters.state || filters.state === row.state) &&
    (!filters.processing_route ||
      filters.processing_route === row.processing_route) &&
    (!filters.inspection_status ||
      filters.inspection_status === row.inspection_status) &&
    (!filters.detection_label ||
      row.detection_labels.includes(filters.detection_label)) &&
    filters.has_warnings !== "true" &&
    filters.inspection_anomaly !== "true" &&
    (!filters.user_id || filters.user_id === row.user.id) &&
    row.created_at.slice(0, 10) >= filters.date_from &&
    row.created_at.slice(0, 10) <= filters.date_to;
  return {
    results: matches && query.page === 1 ? [row] : [],
    count: matches ? 1 : 0,
    page: query.page,
    page_size: query.page_size,
    total_pages: 1,
    next_page: null,
    previous_page: query.page > 1 ? 1 : null,
  };
}

export default function AdminOverview({ view = "dashboard" }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const query = useMemo(() => readQuery(search), [search]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [version, setVersion] = useState(0);
  const [forbidden, setForbidden] = useState(false);
  const [lastSuccess, setLastSuccess] = useState(null);
  const [loadedSearch, setLoadedSearch] = useState(null);
  const saveScroll = useAdminScroll(!busy && loadedSearch === search);
  const isAudit = view === "audit";
  const updateQuery = (next) => {
    const nextParams = queryParams(next);
    if (nextParams.toString() === search) return;
    // Disable actions before router transitions so a second click cannot reuse
    // the previous render's filters while the new query is being applied.
    setBusy(true);
    setData(null);
    setParams(nextParams);
  };

  useEffect(() => {
    if (forbidden) return;
    let active = true;
    let timer;
    const controller = new AbortController();
    setData(null);
    setLastSuccess(null);
    setLoadedSearch(null);
    const invalid = validatePeriod(query.filters);
    if (invalid) {
      setError(invalid);
      setBusy(false);
      setLoadedSearch(search);
      return () => controller.abort();
    }
    async function load() {
      setBusy(true);
      setError("");
      try {
        const options = { signal: controller.signal };
        const result =
          requestMode === "mock"
            ? isAudit
              ? exampleList(query)
              : exampleStatistics(query.filters)
            : await auth.run(() =>
                isAudit
                  ? adminApi.list(auth.user, query.filters, {
                      ...options,
                      page: query.page,
                      page_size: query.page_size,
                    })
                  : adminApi.statistics(auth.user, query.filters, options),
              );
        if (active) {
          setData(result);
          setLastSuccess(new Date().toISOString());
        }
      } catch (err) {
        if (!active) return;
        setData(null);
        if (err.code === "FORBIDDEN") {
          active = false;
          controller.abort();
          clearTimeout(timer);
          setForbidden(true);
          setBusy(false);
          return;
        }
        if (err.name !== "AbortError") setError(describeApiError(err));
      } finally {
        if (active) {
          setBusy(false);
          setLoadedSearch(search);
        }
      }
      if (active && requestMode === "real") timer = setTimeout(load, 30000);
    }
    load();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, version, forbidden, isAudit, search]);

  if (forbidden)
    return (
      <section>
        <Notice kind="error">
          관리자 조회 권한이 없습니다. 이전 조회 자료를 닫았습니다. 권한을
          확인한 뒤 다시 조회해 주세요.
        </Notice>
        <button
          className="secondary"
          onClick={() => {
            setForbidden(false);
            setVersion((value) => value + 1);
          }}
        >
          권한 다시 확인
        </button>
      </section>
    );

  return (
    <div className="admin-overview">
      {requestMode === "mock" && (
        <Notice>가상 데이터로 구성한 화면 예시입니다.</Notice>
      )}
      <AuditFilters query={query} onApply={updateQuery} />
      <div className="audit-refresh">
        <div>
          <b>
            {query.filters.date_from} ~ {query.filters.date_to}
          </b>
          <p className="fine-print">
            최근 갱신 {time(lastSuccess)}
            {busy ? " · 갱신 중…" : ""}
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setVersion((value) => value + 1)}
        >
          새로고침
        </button>
      </div>
      {busy && !data && (
        <Spinner>
          {isAudit ? "요청 목록을 불러오는 중" : "이용 현황을 불러오는 중"}
        </Spinner>
      )}
      <Notice kind="error">
        {error && `${isAudit ? "목록" : "통계"} 조회 실패: ${error}`}
      </Notice>
      {!isAudit && data && (
        <>
          <div className="metrics">
            {adminMetrics.map(([key, label]) => (
              <div className="metric" key={key} data-testid={`metric-${key}`}>
                <span>{label.replace(/\(건\)$/, "")}</span>
                <MetricValue
                  metric={data.summary.metrics[key]}
                  confirmedOnly={confirmedCountCards.has(key)}
                  unit={key === "detection_count" ? "곳" : "건"}
                />
              </div>
            ))}
          </div>
          <DailyChart data={data.daily} />
        </>
      )}
      {isAudit && (
        <section className="panel" aria-label="관리자 요청 목록">
          <div className="panel-title">
            <h2>조회 결과</h2>
            <Select
              label="페이지당"
              aria-label="감사 목록 페이지 크기"
              value={query.page_size}
              onChange={(event) =>
                updateQuery({
                  ...query,
                  page: 1,
                  page_size: Number(event.target.value),
                })
              }
            >
              {[10, 20, 50].map((value) => (
                <option key={value} value={value}>
                  {value}건
                </option>
              ))}
            </Select>
          </div>
          {data &&
            (data.results.length ? (
              <div className="table-wrap">
                <table className="audit-list-table">
                  <thead>
                    <tr>
                      <th>접수 시각</th>
                      <th>이용자 이름</th>
                      <th>상태·경로</th>
                      <th>검사·탐지</th>
                      <th>경고·오류</th>
                      <th>감사</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((row) => (
                      <tr key={row.request_id}>
                        <td>{time(row.created_at)}</td>
                        <td>{row.user.full_name}</td>
                        <td>
                          {requestStateLabel(row.state)}
                          <br />
                          {routeLabels[row.processing_route] || "경로 미결정"}
                        </td>
                        <td>
                          {inspectionLabels[row.inspection_status] ||
                            "확인 필요"}
                          <br />
                          {count(row.detection_count)}
                          <small>
                            {row.detection_labels
                              ?.map((label) => detectionLabels[label] || label)
                              .join(", ")}
                          </small>
                        </td>
                        <td className="audit-diagnostics">
                          {warningText(row)}
                          <br />
                          {row.error_code ? failureLabel(row.error_code) : ""}
                        </td>
                        <td>
                          <button
                            className="icon-button audit-detail-button"
                            aria-label={`${row.user.full_name} 요청 상세 보기`}
                            onClick={() => {
                              saveScroll();
                              navigate(
                                `/admin/audit/${row.request_id}${search ? `?${search}` : ""}`,
                                { state: { adminReturn: "/admin/audit" } },
                              );
                            }}
                          >
                            <Icon name="search" />
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
          {data && (
            <div className="pagination">
              <span>전체 {data.count}건</span>
              <button
                className="icon-button"
                aria-label="이전"
                title="이전"
                disabled={busy || !data.previous_page}
                onClick={() =>
                  updateQuery({ ...query, page: data.previous_page })
                }
              >
                <Icon name="chevron_left" />
              </button>
              <span>
                {data.page} / {data.total_pages}페이지
              </span>
              <button
                className="icon-button"
                aria-label="다음"
                title="다음"
                disabled={busy || !data.next_page}
                onClick={() => updateQuery({ ...query, page: data.next_page })}
              >
                <Icon name="chevron_right" />
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
