import { expect } from "@playwright/test";
import { admin, installAuthFixture } from "./auth-fixture.js";
import {
  auditId,
  auditRow,
  auditDetailFixture,
  complete,
  statistics,
} from "../fixtures/admin.js";

export async function installAudit(page) {
  const auth = await installAuthFixture(page, { signedIn: admin });
  const state = { calls: [], failure: null, delay: null, totals: null };
  await page.route("**/api/v1/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (!/\/admin\/(statistics|requests)\//.test(url.pathname))
      return route.fallback();
    state.calls.push({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    });
    expect(route.request().method()).toBe("GET");
    if (state.delay) {
      const wait = state.delay;
      state.delay = null;
      await wait;
    }
    if (state.failure)
      return route.fulfill({
        status: state.failure.status,
        json: {
          error: { code: state.failure.code, message: state.failure.code },
        },
      });
    if (url.pathname.endsWith("statistics/")) {
      expect(url.searchParams.has("page")).toBe(false);
      const response = statistics(Object.fromEntries(url.searchParams));
      if (state.totals) {
        response.summary.metrics.total_requests = complete(
          state.totals.statistics,
        );
        response.summary.metrics.warning_requests = complete(0);
      }
      return route.fulfill({
        json: response,
      });
    }
    if (url.pathname === `/api/v1/admin/requests/${auditId}/`) {
      expect(url.search).toBe("");
      return route.fulfill({
        json: { request: state.detail || auditDetailFixture() },
      });
    }
    const p = Number(url.searchParams.get("page"));
    return route.fulfill({
      json: {
        count: state.totals?.list ?? 21,
        page: p,
        page_size: 20,
        total_pages: state.totals ? 1 : 2,
        next_page: p === 1 && !state.totals ? 2 : null,
        previous_page: p === 2 ? 1 : null,
        results: [
          auditRow({
            ...state.row,
            original_filename: p === 1 ? "가상-감사.pdf" : "둘째-페이지.pdf",
            ...(state.totals
              ? { inspection_status: "complete", detection_count: 0 }
              : {}),
          }),
        ],
      },
    });
  });
  return { auth, state };
}
