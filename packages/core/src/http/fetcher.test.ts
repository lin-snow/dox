import { describe, expect, test } from "bun:test";

import { ApiError, compose, type Fetcher, type Middleware } from "./fetcher";

// ApiError turns a server error envelope into a single human-readable line.
// The grpc `code` takes precedence over the HTTP status, and a present
// `message` is appended as ": <detail>". These assertions pin the exact copy
// the CLI/TUI surface to users.
describe("ApiError message mapping", () => {
  const msg = (status: number, body: object) =>
    new ApiError(status, JSON.stringify(body)).message;

  test("401 / code 16 both read as unauthorized", () => {
    expect(msg(401, {})).toContain("unauthorized");
    expect(msg(200, { code: 16 })).toContain("unauthorized");
  });

  test("maps the common grpc codes to friendly prefixes", () => {
    expect(msg(404, { code: 5 })).toContain("not found");
    expect(msg(400, { code: 3 })).toContain("invalid argument");
    expect(msg(403, { code: 7 })).toContain("permission denied");
    expect(msg(412, { code: 9 })).toContain("precondition failed");
  });

  test("code 14 and HTTP 503 both read as service unavailable", () => {
    expect(msg(200, { code: 14 })).toContain("service unavailable");
    expect(msg(503, {})).toContain("service unavailable");
  });

  test("other 5xx fall back to a generic server error with the status", () => {
    expect(msg(500, {})).toBe("server error (500)");
  });

  test("appends the server-provided message as a suffix", () => {
    expect(msg(404, { code: 5, message: "todo gone" })).toBe(
      "not found: todo gone",
    );
  });

  test("exposes the grpc code and tolerates a non-JSON body", () => {
    const err = new ApiError(418, "<html>nope</html>");
    expect(err.grpcCode).toBeUndefined();
    expect(err.message).toBe("HTTP 418");
    expect(err.status).toBe(418);
  });
});

describe("compose", () => {
  test("applies middleware left-to-right around the base fetcher", async () => {
    const order: string[] = [];
    const tag =
      (name: string): Middleware =>
      (next) =>
      (req) => {
        order.push(name);
        return next(req);
      };
    const base: Fetcher = () => {
      order.push("base");
      return Promise.resolve(new Response("ok"));
    };
    const fetcher = compose(tag("a"), tag("b"))(base);
    await fetcher(new Request("http://x"));
    expect(order).toEqual(["a", "b", "base"]);
  });
});
