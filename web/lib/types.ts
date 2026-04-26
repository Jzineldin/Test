// Mirrors api/app/models.py — keep in sync until we generate from OpenAPI.

export interface BillingUsage {
  org_id: number;
  plan: string;
  monthly_submission_quota: number;
  submissions_this_period: number;
  over_quota: boolean;
}

export interface CheckoutLinkResponse {
  session_id: string;
  url: string;
  customer_id: string | null;
}

export interface DraftStatus {
  id: number;
  carrier_id: string;
  to: string;
  subject: string;
  body: string;
  attachments: string[];
  sent_at: string | null;
  provider_message_id: string | null;
  quote_replied_at: string | null;
  quote_reply_body: string | null;
  outcome: "pending" | "bound" | "declined" | null;
  outcome_set_at: string | null;
  bound_premium_cents: number | null;
}

export interface ReportPayload {
  period_start: string;
  period_end: string;
  submissions_triaged: number;
  drafts_sent: number;
  drafts_replied: number;
  drafts_bound: number;
  drafts_declined: number;
  quote_back_rate: number;
  bind_rate: number;
  avg_hours_to_quote: number | null;
  bound_premium_dollars: number;
}

export interface CarrierStats {
  carrier_id: string;
  drafts_sent: number;
  drafts_replied: number;
  drafts_bound: number;
  drafts_declined: number;
  quote_back_rate: number;
  bind_rate: number;
  avg_hours_to_quote: number | null;
  bound_premium_dollars: number;
}

export interface AppetiteMatch {
  carrier_id: string;
  carrier_name: string;
  score: number;
  rationale: string;
  risk_flags: string[];
  submission_email: string;
  typical_quote_back_days: number;
}

export interface DraftedEmail {
  id?: number;
  carrier_id: string;
  to: string;
  subject: string;
  body: string;
  attachments: string[];
  sent_at?: string | null;
  provider_message_id?: string | null;
  quote_replied_at?: string | null;
  quote_reply_body?: string | null;
  outcome?: "pending" | "bound" | "declined" | null;
  outcome_set_at?: string | null;
  bound_premium_cents?: number | null;
}

export interface TriageResult {
  submission_id: string;
  matches: AppetiteMatch[];
  drafted_emails: DraftedEmail[];
  summary: string;
}

export interface CarrierAppetiteRule {
  naics_prefixes: string[];
  states_in: string[];
  states_out: string[];
  lines: string[];
  revenue_min?: string;
  revenue_max?: string;
  notes?: string | null;
}

export interface Carrier {
  carrier_id: string;
  name: string;
  submission_email: string;
  underwriter_name?: string | null;
  typical_quote_back_days: number;
  notes?: string | null;
  appetite: CarrierAppetiteRule[];
}

export interface TriageRunSummary {
  id: number;
  submission_id: string;
  insured_name: string;
  primary_state: string;
  match_count: number;
  draft_count: number;
  created_at: string;
}

export interface TriageRunDetail extends TriageRunSummary {
  summary: string;
  submission_json: unknown;
  result: TriageResult;
}

export interface DigestItem {
  kind: "reply" | "bound" | "declined";
  draft_id: number;
  carrier_id: string;
  insured_name: string;
  when: string;
  summary: string;
}
