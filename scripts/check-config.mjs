import { config } from "dotenv";
config({ quiet: true });
const required = [
  "DATABASE_URL",
  "MODEL_PROVIDER",
  "MODEL_API_KEY",
  "MODEL_NAME",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_BASE_URL",
  "PAYPAL_MERCHANT_EMAIL",
  "PAYPAL_MERCHANT_BUSINESS_NAME",
  "PAYPAL_MERCHANT_GIVEN_NAME",
  "PAYPAL_MERCHANT_SURNAME",
  "PAYPAL_MERCHANT_COUNTRY_CODE",
  "APP_URL",
  "DEMO_ACCESS_SECRET",
];
let failed = false;
for (const name of required) {
  const present = Boolean(process.env[name]?.trim());
  console.log(`${present ? "SET" : "MISSING"} ${name}`);
  if (!present) failed = true;
}
const checks = [
  ["MODEL_PROVIDER must be groq", process.env.MODEL_PROVIDER === "groq"],
  [
    "PAYPAL_BASE_URL must use the sandbox endpoint",
    process.env.PAYPAL_BASE_URL === "https://api-m.sandbox.paypal.com",
  ],
  [
    "DEMO_ACCESS_SECRET must contain at least 32 characters",
    (process.env.DEMO_ACCESS_SECRET?.length ?? 0) >= 32,
  ],
  [
    "NEXT_PUBLIC_USE_MOCKS must be false for the live walkthrough",
    process.env.NEXT_PUBLIC_USE_MOCKS !== "true",
  ],
  [
    "PAYPAL_MERCHANT_COUNTRY_CODE must be two uppercase letters",
    /^[A-Z]{2}$/.test(process.env.PAYPAL_MERCHANT_COUNTRY_CODE ?? ""),
  ],
];
for (const [message, valid] of checks) {
  if (!valid) {
    console.log(`CHECK: ${message}`);
    failed = true;
  }
}
for (const [name, protocols] of [
  ["DATABASE_URL", ["postgres:", "postgresql:"]],
  ["APP_URL", ["http:", "https:"]],
]) {
  try {
    if (!protocols.includes(new URL(process.env[name]).protocol))
      throw new Error();
  } catch {
    console.log(
      `CHECK: ${name} must be a valid URL with the expected protocol`,
    );
    failed = true;
  }
}
console.log(
  "Values are never printed. This checks configuration only, not provider connectivity.",
);
process.exitCode = failed ? 1 : 0;
