// Mirrors api/app/models.py — keep in sync until we generate from OpenAPI.

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
  carrier_id: string;
  to: string;
  subject: string;
  body: string;
  attachments: string[];
}

export interface TriageResult {
  submission_id: string;
  matches: AppetiteMatch[];
  drafted_emails: DraftedEmail[];
  summary: string;
}
