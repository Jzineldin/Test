// Mirrors api/app/models.py — keep in sync until we generate from OpenAPI.

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
}

export interface TriageResult {
  submission_id: string;
  matches: AppetiteMatch[];
  drafted_emails: DraftedEmail[];
  summary: string;
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
