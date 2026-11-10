// Typed client for the ScopePay API described in INTEGRATION.md.
// UI code calls `api.*` only; whether requests go over HTTP or to the in-browser
// mock server is decided once here by NEXT_PUBLIC_USE_MOCKS. Real mode never
// falls back to mocks: a failed request surfaces as an ApiError.
import type {
  Analysis,
  Invoice,
  Project,
  Proposal,
  CreateProjectRequest,
  CreateProposalRequest,
  UpdateProposalRequest,
  GetProjectResponse,
  ApproveProposalResponse,
  GetClientProposalResponse,
} from "@/shared/contracts";

export const isMockMode = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

// ---- Request/response shapes from the endpoint agreement -------------------

export type {
  CreateProjectRequest,
  CreateProposalRequest,
  UpdateProposalRequest,
} from "@/shared/contracts";
export type ProjectDetail = GetProjectResponse;
export type ApproveProposalResult = ApproveProposalResponse;
export type ClientProposalView = GetClientProposalResponse;

// ---- Errors -----------------------------------------------------------------

export type ApiErrorBody = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors ?? {};
  }
}

const statusMessages: Record<number, string> = {
  400: "Some fields need attention.",
  401: "Your session has expired. Sign in again.",
  403: "You do not have access to this.",
  404: "Not found.",
  409: "This action is not allowed in the current state. Refresh and try again.",
  502: "An upstream provider failed. Try again shortly.",
};

// ---- Transport ----------------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PATCH";

export type TransportRequest = {
  method: HttpMethod;
  path: string; // relative to /api, e.g. "/projects"
  body?: unknown;
  headers?: Record<string, string>;
};

/** What a transport hands back: an HTTP status and the parsed JSON body (or null). */
export type TransportResponse = { status: number; json: unknown };

type Transport = (req: TransportRequest) => Promise<TransportResponse>;

const httpTransport: Transport = async ({ method, path, body, headers }) => {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, {
      code: "NETWORK_ERROR",
      message:
        "Could not reach the ScopePay server. Check your connection and try again.",
    });
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json };
};

const mockTransport: Transport = async (req) => {
  const { handleMockRequest } = await import("@/mocks/server");
  return handleMockRequest(req);
};

const transport: Transport = isMockMode ? mockTransport : httpTransport;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function request<T>(req: TransportRequest): Promise<T> {
  const { status, json } = await transport(req);
  if (status < 200 || status >= 300) {
    const err = isRecord(json) && isRecord(json.error) ? json.error : null;
    throw new ApiError(status, {
      code: typeof err?.code === "string" ? err.code : `HTTP_${status}`,
      message:
        typeof err?.message === "string"
          ? err.message
          : (statusMessages[status] ?? `Request failed (${status}).`),
      fieldErrors: isRecord(err?.fieldErrors)
        ? (err.fieldErrors as Record<string, string>)
        : undefined,
    });
  }
  if (!isRecord(json) || !("data" in json)) {
    throw new ApiError(status, {
      code: "BAD_RESPONSE",
      message: "The server returned an unexpected response.",
    });
  }
  return json.data as T;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const enc = encodeURIComponent;

// ---- Endpoints ----------------------------------------------------------------

export const api = {
  createDemoSession: (accessSecret: string) =>
    request<{ authenticated: true }>({
      method: "POST",
      path: "/demo-session",
      body: { accessSecret },
    }),

  listProjects: () => request<Project[]>({ method: "GET", path: "/projects" }),

  createProject: (input: CreateProjectRequest) =>
    request<Project>({ method: "POST", path: "/projects", body: input }),

  getProject: (projectId: string) =>
    request<ProjectDetail>({
      method: "GET",
      path: `/projects/${enc(projectId)}`,
    }),

  analyzeConversation: (projectId: string, conversationText: string) =>
    request<Analysis>({
      method: "POST",
      path: `/projects/${enc(projectId)}/analyses`,
      body: { conversationText },
    }),

  createProposal: (projectId: string, input: CreateProposalRequest) =>
    request<Proposal>({
      method: "POST",
      path: `/projects/${enc(projectId)}/proposals`,
      body: input,
    }),

  updateProposal: (proposalId: string, input: UpdateProposalRequest) =>
    request<Proposal>({
      method: "PATCH",
      path: `/proposals/${enc(proposalId)}`,
      body: input,
    }),

  approveProposal: (proposalId: string) =>
    request<ApproveProposalResult>({
      method: "POST",
      path: `/proposals/${enc(proposalId)}/approve`,
    }),

  createInvoice: (
    proposalId: string,
    buyerEmail: string,
    idempotencyKey: string,
  ) =>
    request<Invoice>({
      method: "POST",
      path: `/proposals/${enc(proposalId)}/invoice`,
      body: { buyerEmail },
      headers: { "Idempotency-Key": idempotencyKey },
    }),

  getInvoice: (proposalId: string) =>
    request<Invoice | null>({
      method: "GET",
      path: `/proposals/${enc(proposalId)}/invoice`,
    }),

  getClientProposal: (token: string) =>
    request<ClientProposalView>({
      method: "GET",
      path: "/client/proposal",
      headers: bearer(token),
    }),

  acceptAsClient: (token: string) =>
    request<Proposal>({
      method: "POST",
      path: "/client/accept",
      body: { accepted: true },
      headers: bearer(token),
    }),
};
