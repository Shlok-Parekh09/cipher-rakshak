export interface Company {
  company_id: string;
  brand: string;
  legal_name: string;
  sector: string;
  email: string;
  headers: string[];
  source_url: string;
  live_ready: boolean;
}
export type Status =
  | "DRAFT"
  | "DISPATCHING"
  | "SENT"
  | "BREACHED"
  | "RESOLVED"
  | "ESCALATED_TO_DPBI";
export interface Notice {
  request_id: string;
  name: string;
  identifier: string;
  email: string;
  company: Company;
  notice: string;
  evidence: string;
  header: string;
  status: Status;
  created_at: string;
  safe_mode?: boolean;
  recipient?: string;
  compliance_deadline?: string;
  sent_at?: string;
  ses_message_id?: string;
  simulated?: boolean;
  complaint?: string;
}
export interface Settings {
  endpoint: string;
  safe: boolean;
  recipient: string;
}
export interface AnalyzeInput {
  company_id?: string;
  image?: string;
  name: string;
  identifier: string;
}
export interface DispatchInput {
  request_id: string;
  notice: string;
  safe_mode: boolean;
  demo_recipient?: string;
}
export interface UpdateInput {
  action: "simulate" | "resolve";
}
export interface EscalateInput {
  request_id: string;
}
export interface Health {
  status: string;
  live_enabled: boolean;
}
export interface Directory {
  items: Company[];
}
export interface RequestPage {
  items: Notice[];
  cursor: Record<string, string> | null;
}
