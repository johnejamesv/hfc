import type { EditProposalRequest, EditProposalResponse } from "./ai-edit-protocol";

type Fetcher = typeof fetch;

export class EditRequestError extends Error {}

export async function requestEditProposal(
  request: EditProposalRequest,
  fetcher: Fetcher = fetch,
): Promise<EditProposalResponse> {
  let response: Response;
  try {
    response = await fetcher("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new EditRequestError("Could not reach the edit service. Please try again.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new EditRequestError(readError(body) ?? "The edit request could not be completed. Please try again.");
  }
  if (!isProposal(body)) {
    throw new EditRequestError("The edit service returned an invalid proposal. Please try again.");
  }
  return body;
}

function readError(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : undefined;
}

function isProposal(body: unknown): body is EditProposalResponse {
  if (typeof body !== "object" || body === null) return false;
  const proposal = body as Record<string, unknown>;
  return typeof proposal.replacement === "string" && typeof proposal.explanation === "string";
}
