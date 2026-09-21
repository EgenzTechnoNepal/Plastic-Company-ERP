import type { Role } from "@/constants/roles";

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "textarea"
  | "switch";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormFieldDef {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: FieldOption[];
  /** 1 = half width on >=sm, 2 = full width. Defaults to 1. */
  colSpan?: 1 | 2;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number | boolean;
}

export interface FormSection {
  title: string;
  description?: string;
  fields: FormFieldDef[];
}

export interface FormDefinition {
  /** Stable key used by screens to open the right form. */
  key: string;
  title: string;
  description: string;
  submitLabel: string;
  /** Django REST endpoint this form will POST to once the backend is live. */
  endpoint: string;
  roles?: readonly Role[];
  sections: FormSection[];
}

export type FormValues = Record<string, string | number | boolean | undefined>;