import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const defaults = {
  APP_URL: "http://localhost:3000",
  DEMO_ACCESS_SECRET: randomBytes(32).toString("hex"),
  MODEL_PROVIDER: "groq",
  MODEL_NAME: "openai/gpt-oss-20b",
  PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
  NEXT_PUBLIC_USE_MOCKS: "false",
};
const example = await readFile(".env.example", "utf8");
const body = example
  .split(/\r?\n/)
  .map((line) => {
    const name = line.split("=")[0];
    return name in defaults ? `${name}=${defaults[name]}` : line;
  })
  .join("\n");
try {
  await writeFile(".env", body, { flag: "wx", mode: 0o600 });
  console.log(
    "Created ignored .env with a random demo secret and local/sandbox defaults. Fill the remaining provider and database values locally.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("An .env already exists; no settings were overwritten.");
}
