"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ProposalItemInput } from "@/shared/contracts";
import type { ApiError } from "@/lib/api-client";
import { Button, ErrorNotice, InputField } from "./ui";
import {
  centsToDollarInput,
  formatCents,
  lineAmountCents,
  parseDollarsToCents,
} from "./utils/money";

export type ProposalFormValues = { title: string; items: ProposalItemInput[] };

type Row = {
  key: string;
  description: string;
  hours: string;
  minutes: string;
  rate: string;
};

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

function toRow(item: ProposalItemInput): Row {
  return {
    key: newKey(),
    description: item.description,
    hours: item.estimatedMinutes
      ? String(Math.floor(item.estimatedMinutes / 60))
      : "",
    minutes: item.estimatedMinutes ? String(item.estimatedMinutes % 60) : "",
    rate: centsToDollarInput(item.hourlyRateCents),
  };
}

const wholeNumber = (s: string) =>
  s.trim() === "" ? 0 : /^\d+$/.test(s.trim()) ? Number(s) : NaN;

function parseRow(row: Row): {
  item?: ProposalItemInput;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const h = wholeNumber(row.hours);
  const m = wholeNumber(row.minutes);
  const rate = parseDollarsToCents(row.rate);
  if (!row.description.trim()) errors.description = "Describe the work.";
  if (Number.isNaN(h) || Number.isNaN(m))
    errors.time = "Use whole hours and minutes.";
  else if (m > 59) errors.time = "Minutes must be 0–59.";
  else if (h * 60 + m <= 0) errors.time = "Estimate more than zero time.";
  if (rate === null || rate <= 0)
    errors.rate = "Enter a rate like 50 or 62.50.";
  if (Object.keys(errors).length) return { errors };
  return {
    item: {
      description: row.description.trim(),
      estimatedMinutes: h * 60 + m,
      hourlyRateCents: rate!,
    },
    errors,
  };
}

export function ProposalForm({
  initial,
  submitLabel,
  pendingLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  initial: ProposalFormValues;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: ApiError | null;
  onSubmit: (values: ProposalFormValues) => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [rows, setRows] = useState<Row[]>(() => initial.items.map(toRow));
  const [showErrors, setShowErrors] = useState(false);
  const [defaultRate] = useState(() => initial.items[0]?.hourlyRateCents ?? 0);

  const parsed = rows.map(parseRow);
  const titleError = title.trim() ? undefined : "Enter a proposal title.";
  const valid = !titleError && rows.length > 0 && parsed.every((p) => p.item);
  const previewTotal = parsed.reduce(
    (sum, p) =>
      sum +
      (p.item
        ? lineAmountCents(p.item.estimatedMinutes, p.item.hourlyRateCents)
        : 0),
    0,
  );

  // Compare only the editable fields; server items also carry amountCents.
  const serialize = (t: string, items: (ProposalItemInput | undefined)[]) =>
    JSON.stringify([
      t.trim(),
      items.map(
        (i) =>
          i && [i.description.trim(), i.estimatedMinutes, i.hourlyRateCents],
      ),
    ]);
  const dirty =
    serialize(
      title,
      parsed.map((p) => p.item),
    ) !== serialize(initial.title, initial.items) ||
    rows.length !== initial.items.length;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!valid) return;
    onSubmit({ title: title.trim(), items: parsed.map((p) => p.item!) });
  }

  const serverErrors = error?.fieldErrors ?? {};

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <InputField
        label="Proposal title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={(showErrors ? titleError : undefined) ?? serverErrors.title}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium text-slate-800">
          Line items
        </legend>
        {rows.map((row, i) => {
          const errs = showErrors ? parsed[i]!.errors : {};
          const item = parsed[i]!.item;
          return (
            <div
              key={row.key}
              className="rounded-md border border-slate-200 p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                <InputField
                  label={`Item ${i + 1} description`}
                  value={row.description}
                  onChange={(e) =>
                    update(row.key, { description: e.target.value })
                  }
                  error={
                    errs.description ?? serverErrors[`items.${i}.description`]
                  }
                />
                <InputField
                  label="Hours"
                  inputMode="numeric"
                  className="sm:w-20"
                  value={row.hours}
                  onChange={(e) => update(row.key, { hours: e.target.value })}
                />
                <InputField
                  label="Minutes"
                  inputMode="numeric"
                  className="sm:w-20"
                  value={row.minutes}
                  onChange={(e) => update(row.key, { minutes: e.target.value })}
                />
                <InputField
                  label="Rate (USD/h)"
                  inputMode="decimal"
                  className="sm:w-28"
                  value={row.rate}
                  onChange={(e) => update(row.key, { rate: e.target.value })}
                  error={
                    errs.rate ?? serverErrors[`items.${i}.hourlyRateCents`]
                  }
                />
              </div>
              {(errs.time ?? serverErrors[`items.${i}.estimatedMinutes`]) && (
                <p className="mt-1 text-sm text-red-800">
                  {errs.time ?? serverErrors[`items.${i}.estimatedMinutes`]}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  {item
                    ? `${item.estimatedMinutes} min × ${formatCents(item.hourlyRateCents)}/h = ${formatCents(
                        lineAmountCents(
                          item.estimatedMinutes,
                          item.hourlyRateCents,
                        ),
                      )}`
                    : "Complete this line to see its amount."}
                </span>
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    className="min-h-8 py-1"
                    onClick={() =>
                      setRows((rs) => rs.filter((r) => r.key !== row.key))
                    }
                    aria-label={`Remove item ${i + 1}`}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {serverErrors.items && (
          <p className="text-sm text-red-800">{serverErrors.items}</p>
        )}
        <div>
          <Button
            variant="secondary"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                toRow({
                  description: "",
                  estimatedMinutes: 0,
                  hourlyRateCents: defaultRate,
                }),
              ])
            }
          >
            Add line item
          </Button>
        </div>
      </fieldset>

      <p className="text-sm text-slate-700">
        Preview total:{" "}
        <strong className="text-slate-900">{formatCents(previewTotal)}</strong>{" "}
        <span className="text-slate-600">
          (the server calculates the amount you approve)
        </span>
      </p>

      <ErrorNotice error={error?.status === 401 ? null : error} />

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          pending={pending}
          pendingLabel={pendingLabel}
          disabled={!dirty && !!onDirtyChange}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
