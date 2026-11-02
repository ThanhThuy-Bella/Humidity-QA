import { NextResponse } from "next/server";
import { HttpError } from "./auth";

/** Bọc API route: trả JSON lỗi thống nhất */
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      const message = e instanceof Error ? e.message : String(e);
      console.error("[api]", message);
      return NextResponse.json({ error: message }, { status });
    }
  };
}
