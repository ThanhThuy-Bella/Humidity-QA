// Kiểu dữ liệu dùng chung – khớp với schema Supabase (supabase/migrations/0001_schema.sql)

export type Role = "admin" | "planner" | "qa" | "viewer";

export interface Settings {
  id: number;
  hum_limit: number;
  sample_rate: number;
  readings_per_carton: number;
  rain_start: number;
  rain_end: number;
  iso_weeks_rain: number;
  iso_weeks_dry: number;
  preship_earliest: number;
  preship_deadline: number;
  plan_lookahead: number;
  plan_date_override: string | null;
  grade_filter: string;
  warehouse_sheet: string;
  mail_subject: string;
  form_warehouse: string;
  company_name: string;
  company_address: string;
  company_tel: string;
  email_enabled: boolean;
  email_recipients: string[];
  email_cc: string[];
  email_days_ahead: number;
  email_skip_empty: boolean;
  last_email_date: string | null;
  email_trigger: "CRON" | "AFTER_IMPORT";
  email_send_days: number[]; // 1 = T2 … 6 = T7
  email_notify_ahead: boolean; // báo trước 1 ngày khi có kế hoạch mới
  email_subject_tpl: string; // tiêu đề, có biến {ngay} {so_lo} {so_tre} {ngay_mai} {so_lo_mai} {so_capa}
  email_intro: string; // lời mở đầu (nhiều dòng)
  email_signature: string; // chữ ký (nhiều dòng)
  insp_wave_weekday: number; // v1.9: ngày đợt kiểm trong tuần (1 = T2)
  max_cartons_per_day: number; // v1.9: số thùng mẫu tối đa / ngày (0 = không giới hạn)
  last_imported_file: string | null;
  last_import_time: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
}

/** 1 dòng trong báo cáo kho FGs_Report = 1 thùng (UCC). 17 cột giống tblWarehouse */
export interface WarehouseCarton {
  storeCd: string;
  customer: string;
  location: string;
  pallet: string;
  refNo: string; // JO
  styleNo: string;
  buyerPo: string;
  ucc: string;
  color: string;
  qty: number;
  buyerPoDate: string | null;
  inWarehouseDate: string | null;
  brandName: string;
  styleDesc: string;
  grade: string;
  aging: string;
  storeName: string;
}

export interface StockLot {
  id?: number;
  import_id?: number | null;
  brand_code: string;
  customer: string;
  brand_name: string;
  jo: string;
  buyer_po: string;
  style: string;
  colors: string;
  locations: string;
  pallets: string;
  location_pallets: Record<string, string[]>;
  cartons: number;
  qty: number;
  bpo_date: string | null;
  stock_in_date: string | null;
  stores: string;
  color_cartons?: Record<string, number>; // v1.9: số thùng theo màu
}

export type BpoStatus = "NO BPO" | "OVERDUE" | "DUE" | "LATER";
export type Trigger = "" | "PRE-SHIPMENT" | "RE-INSPECT (new BPO)";

/** Stock lot + các cột công thức O:W của tblLots */
export interface EvaluatedLot extends StockLot {
  days_in_wh: number | null;
  days_to_bpo: number | null;
  last_insp_date: string | null;
  sched_insp_date: string | null;
  iso_min_days: number | null;
  days_in_wh_at_insp: number | null;
  bpo_status: BpoStatus;
  trigger: Trigger;
  priority: "" | "LATE" | "ON TIME";
}

export type LotResult = "PENDING" | "IN PROGRESS" | "PASS" | "FAIL";

export interface PlanRow {
  plan_id: string;
  brand_code: string;
  customer: string | null;
  jo: string;
  buyer_po: string;
  style: string | null;
  color: string | null;
  locations: string | null;
  pallets: string | null;
  location_pallets: Record<string, string[]>;
  cartons: number;
  qty: number;
  bpo_date: string | null;
  stock_in_date: string | null;
  sched_date: string;
  trigger: string;
  sample_cartons: number;
  status: "OPEN" | "ARCHIVED" | "CANCELLED";
  final_result: string | null;
  inspection_date: string | null;
  qa_name: string | null;
  rework_humidity: number | null;
  remark: string | null;
  cancel_reason: string | null;
  kind: "NORMAL" | "REWORK";
  parent_plan_id: string | null;
  sample_colors?: Record<string, number> | null; // v1.9: số thùng mẫu theo màu
  created_at: string;
}

/** v_plan = PlanRow + cột công thức */
export interface PlanView extends PlanRow {
  days_in_wh: number | null;
  aging_weeks: number | null;
  threshold_weeks: number;
  cartons_tested: number;
  cartons_started: number;
  max_humidity: number | null;
  fail_cartons: number;
  insp_by: string | null;
  plan_date: string;
  lot_result: LotResult;
  priority: "" | "DONE" | "LATE" | "ON TIME";
}

export interface ReadingRow {
  id: number;
  plan_id: string;
  sample_no: number;
  inspection_date: string | null;
  location: string | null;
  pallet: string | null;
  audit_carton_no: string | null;
  qty_in_carton: string | null;
  color?: string | null; // v1.9: màu của thùng mẫu
  r1: number | null;
  r2: number | null;
  r3: number | null;
  reading_count: number;
  carton_max: number | null;
}

export interface HistoryRow {
  plan_id: string;
  inspection_date: string;
  brand_code: string | null;
  jo: string;
  color: string | null;
  bpo: string | null;
  stock_in_date: string | null;
  exfty_date: string | null;
  total_cartons: number | null;
  audit_carton_no: string | null;
  qty_in_carton: string | null;
  readings: string | null;
  reading_count: number | null;
  cartons_tested: number | null;
  sample_required: number | null;
  sampling_check: string | null;
  max_humidity: number | null;
  avg_humidity: number | null;
  result: string;
  qa: string | null;
  rework_humidity: number | null;
  trigger: string | null;
  source: string | null;
  archived_on: string | null;
  location_pallet: string | null;
}

export type CapaStatus = "OPEN" | "IN_PROGRESS" | "VERIFICATION" | "CLOSED" | "CANCELLED";

export interface Capa {
  id: string;
  capa_no: string;
  plan_id: string | null;
  history_plan_id: string | null;
  brand_code: string | null;
  jo: string | null;
  buyer_po: string | null;
  color: string | null;
  inspection_date: string | null;
  max_humidity: number | null;
  hum_limit: number | null;
  failed_cartons: number | null;
  problem: string | null;
  root_cause: string | null;
  containment: string | null;
  corrective_action: string | null;
  preventive_action: string | null;
  owner: string | null;
  due_date: string | null;
  rework_humidity: number | null;
  verification: string | null;
  status: CapaStatus;
  source: "AUTO" | "MANUAL";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

/** Kết quả Daily Process – tương đương MsgBox "Daily process completed" */
export interface DailyProcessResult {
  fileName: string;
  reportDate: string | null;
  cartonsImported: number;
  includedCartons: number;
  stockLots: number;
  archived: number;
  newTasks: number;
  rescheduled: number;
  removed: number;
  sampleRows: number;
  newBrands: string[];
  newStores: string[];
  skipped?: boolean;
  message?: string;
}
