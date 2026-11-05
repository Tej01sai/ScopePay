import { NextResponse } from "next/server";
import type { ApiError, ApiSuccess } from "@/shared/contracts";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export function success<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function handle(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    const failure =
      error instanceof ApiFailure
        ? error
        : new ApiFailure(
            503,
            "SERVICE_UNAVAILABLE",
            "The service is temporarily unavailable. Please try again.",
          );
    return NextResponse.json<ApiError>(
      {
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}),
        },
      },
      { status: failure.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/** Count streamed bytes as Content-Length may be absent or untrusted. */
export async function readJson(
  request: Request,
  maxBytes = 65536,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new ApiFailure(
      400,
      "INVALID_INPUT",
      "Send an application/json request.",
    );
  }
  if (!request.body)
    throw new ApiFailure(400, "INVALID_INPUT", "A JSON body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiFailure(
          400,
          "INPUT_TOO_LARGE",
          "The request body is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ApiFailure(400, "INVALID_INPUT", "Send a valid JSON object.");
  }
}
