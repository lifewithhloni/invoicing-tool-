/**
 * Database types for the Supabase client, written by hand to match
 * supabase/migrations. Regenerate with `supabase gen types typescript`
 * once a database is available, and keep this file in step with migrations.
 *
 * Numeric columns (rates, amounts) are always selected with a `::text` cast so
 * values keep their exact decimal form; they are typed as strings here.
 */

export type AppRole = "admin" | "finance";
export type SiteKind = "collection" | "destination";

type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

type Audit = { created_at: string; created_by: string | null };

export type ProfileRow = {
  id: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanySettingsRow = {
  id: true;
  legal_name: string | null;
  letterhead_note: string | null;
  registration_number: string | null;
  physical_address: string | null;
  phone: string | null;
  email: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  vat_rate: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  default_payment_terms_days: number | null;
  weight_difference_highlight_pct: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type DocumentSequenceRow = {
  name: "delivery" | "invoice" | "credit_note";
  next_value: number;
  updated_at: string;
};

export type CustomerRow = Audit & {
  id: string;
  name: string;
  registration_number: string | null;
  vat_number: string | null;
  billing_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  payment_terms_days: number | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

export type SiteRow = Audit & {
  id: string;
  kind: SiteKind;
  name: string;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

export type CoalProductRow = Audit & {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  updated_at: string;
};

export type CoalProductAliasRow = Audit & {
  id: string;
  coal_product_id: string;
  site_id: string | null;
  alias: string;
  alias_key: string;
};

export type DriverRow = Audit & {
  id: string;
  full_name: string;
  slip_name: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

export type TruckRow = Audit & {
  id: string;
  registration: string;
  registration_key: string;
  trailer_registrations: string[];
  description: string | null;
  default_driver_id: string | null;
  is_active: boolean;
  updated_at: string;
};

export type CustomerRateRow = Audit & {
  id: string;
  customer_id: string;
  rate_per_ton: string;
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
};

export type CustomerRecurringDeductionRow = Audit & {
  id: string;
  customer_id: string;
  description: string;
  description_key: string;
  monthly_amount: string;
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
};

type Generated = "id" | "created_at" | "created_by" | "updated_at";

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Pick<ProfileRow, "full_name"> & Partial<Pick<ProfileRow, "role" | "is_active">>>;
      company_settings: Table<CompanySettingsRow, Partial<Omit<CompanySettingsRow, "id" | "updated_at" | "updated_by">>>;
      document_sequences: Table<DocumentSequenceRow, Pick<DocumentSequenceRow, "next_value">>;
      customers: Table<CustomerRow, Omit<CustomerRow, Generated | "is_active"> & { is_active?: boolean }>;
      sites: Table<SiteRow, Omit<SiteRow, Generated | "is_active"> & { is_active?: boolean }>;
      coal_products: Table<CoalProductRow, Omit<CoalProductRow, Generated | "is_active"> & { is_active?: boolean }>;
      coal_product_aliases: Table<CoalProductAliasRow, Omit<CoalProductAliasRow, Generated | "alias_key">>;
      drivers: Table<DriverRow, Omit<DriverRow, Generated | "is_active"> & { is_active?: boolean }>;
      trucks: Table<
        TruckRow,
        Omit<TruckRow, Generated | "registration_key" | "is_active"> & { is_active?: boolean }
      >;
      customer_rates: Table<CustomerRateRow, never>;
      customer_recurring_deductions: Table<CustomerRecurringDeductionRow, never>;
    };
    Views: Record<string, never>;
    Functions: {
      set_customer_rate: {
        Args: { p_customer_id: string; p_rate_per_ton: string; p_effective_from: string; p_reason?: string | null };
        Returns: string;
      };
      set_customer_recurring_deduction: {
        Args: {
          p_customer_id: string;
          p_description: string;
          p_monthly_amount: string;
          p_effective_from: string;
          p_reason?: string | null;
        };
        Returns: string;
      };
      end_customer_recurring_deduction: {
        Args: { p_deduction_id: string; p_last_day: string };
        Returns: undefined;
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { app_role: AppRole; site_kind: SiteKind };
    CompositeTypes: Record<string, never>;
  };
};
