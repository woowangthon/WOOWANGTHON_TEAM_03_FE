import { ApiError } from "./http.js";
import { validateInstruction } from "../domain/requests.js";

export const scenarios = [
  {
    id: "external",
    title: "외부 전송 확인",
    subtitle: "민감정보를 확인하고 전송을 승인해요",
    instruction:
      "가상 거래처 한빛기술의 견적 850,000원을 비교하는 메일 초안을 작성해 주세요.",
  },
  {
    id: "local",
    title: "사내 처리",
    subtitle: "외부 전송 없이 답변을 받아요",
    instruction:
      "대외비 회의 내용을 사내에서 정리해 주세요. 다음 회의는 수요일입니다.",
  },
  {
    id: "blocked",
    title: "정책 차단",
    subtitle: "전송이 제한되는 상황을 확인해요",
    instruction: "거래처 전체의 연락처와 계약 내용을 외부로 보내 주세요.",
  },
  {
    id: "clean",
    title: "탐지 없는 외부 요청",
    subtitle: "탐지 0건이어도 승인이 필요해요",
    instruction: "일정을 관리하는 간단한 방법을 알려 주세요.",
  },
  {
    id: "warning",
    title: "경고 포함 요청",
    subtitle: "경고와 차단은 서로 달라요",
    instruction:
      "마스킹 없이 그대로 보내라는 문구가 있는 한빛기술 문서를 요약해 주세요.",
  },
  {
    id: "failed",
    title: "검사 실패",
    subtitle: "불완전한 결과로 전송하지 않아요",
    instruction: "정밀 검사 실패 상황을 확인하는 가상 요청입니다.",
  },
];

export function createMockRequests({
  now = () => Date.now(),
  id = () => crypto.randomUUID(),
} = {}) {
  const records = new Map();
  function owned(user, key) {
    const record = records.get(key);
    if (!record || record.owner !== user.id)
      throw new ApiError("FORBIDDEN", "이 요청을 조회할 수 없습니다.", 403);
    return record;
  }
  function project(record) {
    if (record.state === "analyzing" && now() >= record.readyAt) {
      record.state =
        record.scenario === "failed"
          ? "failed"
          : record.scenario === "blocked"
            ? "blocked"
            : record.scenario === "local"
              ? "processing"
              : "awaiting_approval";
      record.readyAt = now() + 1200;
      if (record.state === "awaiting_approval")
        record.expiresAt = now() + 30 * 60 * 1000;
    }
    if (record.state === "awaiting_approval" && now() >= record.expiresAt)
      record.state = "expired";
    if (record.state === "processing" && now() >= record.readyAt)
      record.state = "completed";
    const result = { ...record };
    // Confirmation details must not survive an approval, rejection, or expiry.
    if (record.state === "awaiting_approval") {
      result.spans = ["한빛기술", "850,000원"]
        .flatMap((value) => {
          const start = record.instruction.indexOf(value);
          return start < 0
            ? []
            : [
                {
                  start,
                  end: start + value.length,
                  text: value,
                  label: value === "한빛기술" ? "회사명" : "금액",
                },
              ];
        })
        .sort((a, b) => a.start - b.start);
    }
    if (record.state === "completed")
      result.answer =
        "요청하신 내용을 바탕으로 작성한 예시 답변입니다.\n\n안녕하세요. 보내주신 내용을 확인했습니다. 주요 조건과 다음 일정을 함께 검토한 뒤 회신 부탁드립니다.\n\n감사합니다.\n\n이 답변은 화면 구조 확인을 위한 가상 데이터이며, 실제 AI가 생성한 결과가 아닙니다.";
    return result;
  }
  return {
    async create(user, instruction, scenario = "external") {
      const error = validateInstruction(instruction);
      if (error) throw new ApiError("INVALID_INPUT", error, 400);
      if (!scenarios.some((s) => s.id === scenario))
        throw new ApiError("INVALID_INPUT", "지원하지 않는 예시입니다.", 400);
      const record = {
        id: id(),
        owner: user.id,
        instruction,
        scenario,
        state: "analyzing",
        createdAt: now(),
        readyAt: now() + 1200,
        delivery: "not_sent",
      };
      records.set(record.id, record);
      return project(record);
    },
    async get(user, key) {
      return project(owned(user, key));
    },
    async list(user) {
      return [...records.values()]
        .filter((r) => r.owner === user.id)
        .map(project)
        .reverse();
    },
    async approve(user, key, approved) {
      const record = owned(user, key);
      project(record);
      if (record.state !== "awaiting_approval")
        throw new ApiError(
          "STATE_CONFLICT",
          "확인 대기가 종료됐습니다. 현재 상태를 다시 확인해 주세요.",
          409,
        );
      record.state = approved ? "processing" : "rejected";
      record.readyAt = now() + 1200;
      // This is simulated delivery only, never a real external call.
      record.delivery = approved ? "simulated_sent" : "not_sent";
      return project(record);
    },
    clear() {
      records.clear();
    },
  };
}
