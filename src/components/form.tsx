"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";
import { initialFormState, type FormState } from "@/lib/forms";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const FormStateContext = createContext<FormState>(initialFormState);

/**
 * A form bound to a server action. Shows the action's message and passes
 * field errors to the fields inside it. Set resetOnSuccess for "add" forms.
 */
export function ActionForm({
  action,
  children,
  resetOnSuccess = false,
  className = "",
}: {
  action: Action;
  children: ReactNode;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormStateContext value={state}>
      <form ref={formRef} action={formAction} className={`flex flex-col gap-4 ${className}`} noValidate>
        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className={`rounded-md px-3 py-2 text-sm ${
              state.ok ? "bg-success/12 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {state.message}
          </p>
        )}
        {children}
      </form>
    </FormStateContext>
  );
}

function useFieldError(name: string): string | undefined {
  return useContext(FormStateContext).fieldErrors?.[name];
}

const inputClass =
  "block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted/70 focus:border-accent focus:outline-2 focus:outline-accent/30 aria-invalid:border-danger";

function FieldShell({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const error = useFieldError(name);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export function TextField({
  name,
  label,
  hint,
  defaultValue,
  type = "text",
  required,
  autoComplete,
  inputMode,
  placeholder,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  defaultValue?: string | number | null;
  type?: "text" | "email" | "tel" | "date" | "password" | "number";
  required?: boolean;
  autoComplete?: string;
  inputMode?: "decimal" | "numeric" | "text" | "tel" | "email";
  placeholder?: string;
}) {
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={required ? label : `${label} (optional)`} hint={hint}>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? undefined}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className={inputClass}
      />
    </FieldShell>
  );
}

export function TextArea({
  name,
  label,
  hint,
  defaultValue,
  rows = 3,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  defaultValue?: string | null;
  rows?: number;
}) {
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={`${label} (optional)`} hint={hint}>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? undefined}
        aria-invalid={error ? true : undefined}
        className={inputClass}
      />
    </FieldShell>
  );
}

export function Select({
  name,
  label,
  options,
  defaultValue,
  hint,
  placeholder,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={label} hint={hint}>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        className={inputClass}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 rounded border-border accent-accent"
      />
      <div>
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant = "primary",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass(variant)} self-start`}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
