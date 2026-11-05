/** Shared wire contract. Money is integer USD cents; durations are integer minutes. */
export type Classification = "INCLUDED" | "ADDITIONAL" | "UNCLEAR";
export type ProposalStatus = "DRAFT" | "APPROVED" | "ACCEPTED";
export type InvoiceStatus =
  "CREATING" | "PENDING" | "PAID" | "CANCELLED" | "ERROR";
export type ApiSuccess<T> = { data: T };
export type ApiError = {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type Project = {
  id: string;
  title: string;
  clientName: string;
  scopeText: string;
  hourlyRateCents: number;
  currency: "USD";
  createdAt: string;
};
export type Finding = {
  id: string;
  classification: Classification;
  title: string;
  explanation: string;
  scopeQuote: string | null;
  requestQuote: string;
  clarificationQuestion: string | null;
};
export type Analysis = {
  id: string;
  projectId: string;
  conversationText: string;
  findings: Finding[];
};
export type ProposalItemInput = {
  description: string;
  estimatedMinutes: number;
  hourlyRateCents: number;
};
export type Proposal = {
  id: string;
  projectId: string;
  analysisId: string;
  findingIds: string[];
  title: string;
  items: (ProposalItemInput & { amountCents: number })[];
  totalCents: number;
  currency: "USD";
  status: ProposalStatus;
  approvedAt: string | null;
  acceptedAt: string | null;
};
export type Invoice = {
  id: string;
  proposalId: string;
  providerInvoiceId: string | null;
  paymentUrl: string | null;
  status: InvoiceStatus;
  totalCents: number;
  currency: "USD";
  paidAt: string | null;
};
export type CreateDemoSessionRequest = { accessSecret: string };
export type CreateDemoSessionResponse = { authenticated: true };
export type ListProjectsResponse = Project[];
export type CreateProjectRequest = Pick<
  Project,
  "title" | "clientName" | "scopeText" | "hourlyRateCents" | "currency"
>;
export type CreateProjectResponse = Project;
export type GetProjectResponse = {
  project: Project;
  analyses: Analysis[];
  proposals: Proposal[];
  invoices: Invoice[];
};
export type CreateAnalysisRequest = { conversationText: string };
export type CreateAnalysisResponse = Analysis;
export type CreateProposalRequest = {
  analysisId: string;
  findingIds: string[];
  title: string;
  items: ProposalItemInput[];
};
export type CreateProposalResponse = Proposal;
export type UpdateProposalRequest = Pick<
  CreateProposalRequest,
  "title" | "items"
>;
export type UpdateProposalResponse = Proposal;
export type ApproveProposalResponse = {
  proposal: Proposal;
  approvalUrl: string;
};
/** Both client endpoints require Authorization: Bearer <opaque token>. */
export type GetClientProposalResponse = {
  proposal: Proposal;
  projectTitle: string;
  invoice: Invoice | null;
};
export type AcceptProposalRequest = { accepted: true };
export type AcceptProposalResponse = Proposal;
/** Requires an Idempotency-Key header. The server loads the approved price. */
export type CreateInvoiceRequest = { buyerEmail: string };
export type CreateInvoiceResponse = Invoice;
export type GetInvoiceResponse = Invoice | null;
