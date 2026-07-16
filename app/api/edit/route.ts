import { NextResponse } from "next/server";
import {
  hasValidEditRequestRange,
  type EditProposalRequest,
  type EditProposalResponse,
} from "../../ai-edit-protocol";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_SOURCE_LENGTH = 100_000;
const MAX_INSTRUCTION_LENGTH = 2_000;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_REPLACEMENT_LENGTH = 50_000;
const MAX_EXPLANATION_LENGTH = 1_000;

const editSchema = {
  type: "object",
  additionalProperties: false,
  required: ["replacement", "explanation"],
  properties: {
    replacement: { type: "string" },
    explanation: { type: "string" },
  },
} as const;

function isEditRequest(value: unknown): value is EditProposalRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  return (
    (request.kind === "write" || request.kind === "change") &&
    typeof request.instruction === "string" &&
    typeof request.challengeSummary === "string" &&
    typeof request.source === "string" &&
    typeof request.range === "object" &&
    request.range !== null
  );
}

function validRequest(request: EditProposalRequest): string | undefined {
  if (!request.instruction.trim() || request.instruction.length > MAX_INSTRUCTION_LENGTH) return "Describe the requested edit in a short phrase.";
  if (!request.challengeSummary.trim() || request.challengeSummary.length > MAX_SUMMARY_LENGTH) return "The selected challenge was invalid.";
  if (request.source.length > MAX_SOURCE_LENGTH || !hasValidEditRequestRange(request)) return "The requested code range was invalid.";
  if (request.kind === "change" && request.range.from === request.range.to) return "Select code before asking HFC to change it.";
  return undefined;
}

function isProposal(value: unknown): value is EditProposalResponse {
  if (typeof value !== "object" || value === null) return false;
  const proposal = value as Record<string, unknown>;
  return (
    Object.keys(proposal).length === 2 &&
    typeof proposal.replacement === "string" &&
    typeof proposal.explanation === "string" &&
    proposal.replacement.length <= MAX_REPLACEMENT_LENGTH &&
    proposal.explanation.trim().length > 0 &&
    proposal.explanation.length <= MAX_EXPLANATION_LENGTH
  );
}

function responseText(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const direct = (value as { output_text?: unknown }).output_text;
  return typeof direct === "string" ? direct : undefined;
}

function mockProposal(request: EditProposalRequest): EditProposalResponse {
  const selected = request.source.slice(request.range.from, request.range.to);
  const note = request.instruction.trim().replace(/\s+/g, " ");
  return {
    replacement: `# Mock edit: ${note}\n${selected}`,
    explanation: "Deterministic mock proposal for local development.",
  };
}

function modelInput(request: EditProposalRequest): string {
  const selectedText = request.source.slice(request.range.from, request.range.to);
  return JSON.stringify({
    challenge_summary: request.challengeSummary,
    current_python_source: request.source,
    selection_range: request.range,
    selected_text: selectedText,
    instruction: request.instruction.trim(),
    operation: request.kind,
  });
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isEditRequest(body)) return NextResponse.json({ error: "The edit request was invalid." }, { status: 400 });

  const validationError = validRequest(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  if (process.env.HFC_EDIT_ADAPTER === "mock") return NextResponse.json(mockProposal(body));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI edits are unavailable. Set OPENAI_API_KEY on the server or enable HFC_EDIT_ADAPTER=mock." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_EDIT_MODEL ?? "gpt-5-mini",
        input: [
          {
            role: "system",
            content: "You propose one targeted Python edit. Return only the replacement for the supplied range and a concise explanation. Do not include markdown fences, file names, commands, or edits outside that range.",
          },
          { role: "user", content: modelInput(body) },
        ],
        text: { format: { type: "json_schema", name: "targeted_python_edit", strict: true, schema: editSchema } },
      }),
      cache: "no-store",
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("[edit] OpenAI Responses request failed", { status: response.status });
      return NextResponse.json({ error: "The AI edit service could not complete the request. Please try again." }, { status: 502 });
    }

    const text = responseText(result);
    let proposal: unknown = null;
    try {
      proposal = text ? JSON.parse(text) : null;
    } catch {
      // The provider response is not trusted even when a schema was requested.
    }
    if (!isProposal(proposal)) {
      console.error("[edit] OpenAI returned malformed structured output");
      return NextResponse.json({ error: "The AI edit service returned an invalid proposal. Please try again." }, { status: 502 });
    }
    return NextResponse.json(proposal);
  } catch {
    console.error("[edit] Could not reach OpenAI or parse its response");
    return NextResponse.json({ error: "Could not reach the AI edit service. Please try again." }, { status: 502 });
  }
}
