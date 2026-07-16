import type { TextRange } from "./editor-actions";

export type EditRequestKind = "write" | "change";

export interface EditProposalRequest {
  readonly kind: EditRequestKind;
  readonly instruction: string;
  readonly challengeSummary: string;
  readonly source: string;
  readonly range: TextRange;
}

export interface EditProposalResponse {
  readonly replacement: string;
  readonly explanation: string;
}

export function hasValidEditRequestRange(request: EditProposalRequest): boolean {
  const { from, to } = request.range;
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && from <= to && to <= request.source.length;
}
