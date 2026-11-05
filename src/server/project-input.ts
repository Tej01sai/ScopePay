import type { CreateProjectRequest } from "../shared/contracts.ts";

export function validateProject(input: Record<string, unknown>): {
  data?: CreateProjectRequest;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  for (const [key, limit] of [
    ["title", 200],
    ["clientName", 200],
    ["scopeText", 40000],
  ] as const) {
    const value = input[key];
    if (typeof value !== "string" || !value.trim() || value.length > limit)
      fieldErrors[key] = `Enter between 1 and ${limit} characters.`;
  }
  if (
    !Number.isInteger(input.hourlyRateCents) ||
    (input.hourlyRateCents as number) < 1 ||
    (input.hourlyRateCents as number) > 10000000
  )
    fieldErrors.hourlyRateCents =
      "Enter an integer rate from 1 to 10000000 USD cents.";
  if (input.currency !== "USD") fieldErrors.currency = "Only USD is supported.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return {
    data: {
      title: (input.title as string).trim(),
      clientName: (input.clientName as string).trim(),
      scopeText: input.scopeText as string,
      hourlyRateCents: input.hourlyRateCents as number,
      currency: "USD",
    },
    fieldErrors,
  };
}
