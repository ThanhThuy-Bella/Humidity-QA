// Màu dùng chung cho giao diện điện thoại (v1.5) – mỗi brand một màu, mỗi trạng thái một màu
import type { PlanView } from "./types";

export type Tone = { bg: string; fg: string; bar: string };

const BRAND: Tone[] = [
  { bg: "#E0F2FE", fg: "#075985", bar: "#0284C7" },
  { bg: "#FCE7F3", fg: "#9D174D", bar: "#DB2777" },
  { bg: "#EDE9FE", fg: "#5B21B6", bar: "#7C3AED" },
  { bg: "#DCFCE7", fg: "#166534", bar: "#16A34A" },
  { bg: "#FEF3C7", fg: "#92400E", bar: "#D97706" },
  { bg: "#E0E7FF", fg: "#3730A3", bar: "#4F46E5" },
  { bg: "#CCFBF1", fg: "#115E59", bar: "#0D9488" },
];

export function brandTone(code: string): Tone {
  let h = 0;
  for (const ch of code || "?") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BRAND[h % BRAND.length];
}

export const STATUS = {
  todo: { label: "Chưa đo", bg: "#E0F2FE", fg: "#075985", bar: "#0284C7" },
  doing: { label: "Đang đo dở", bg: "#FEF3C7", fg: "#92400E", bar: "#D97706" },
  fail: { label: "Có thùng không đạt", bg: "#FEE2E2", fg: "#991B1B", bar: "#DC2626" },
  rework: { label: "Kiểm lại sau tái chế", bg: "#EDE9FE", fg: "#5B21B6", bar: "#7C3AED" },
} as const;

export type StatusKey = keyof typeof STATUS;

export function lotStatus(p: PlanView): StatusKey {
  if (p.kind === "REWORK") return "rework";
  if (p.lot_result === "FAIL") return "fail";
  if (p.cartons_tested > 0 || p.lot_result === "IN PROGRESS") return "doing";
  return "todo";
}

export function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "")).toUpperCase() || "?";
}
