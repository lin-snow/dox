import { describe, expect, test } from "bun:test";

import type { Fetcher } from "../http";
import { TodoClient } from "./client";

// Records every outgoing Request and replies with a canned JSON body so we can
// assert on the wire shape the client produces (URL, method, snake_case body)
// without a live server. `reply` defaults to an empty object — enough for the
// methods that only care about the request side.
function stub(reply: unknown = {}) {
  const seen: Request[] = [];
  const fetcher: Fetcher = (req) => {
    seen.push(req);
    return Promise.resolve(
      new Response(JSON.stringify(reply), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  return { fetcher, seen };
}

const BASE = "http://localhost:6278";

describe("TodoClient.listTodos", () => {
  test("unwraps the { todos } envelope", async () => {
    const { fetcher } = stub({ todos: [{ id: "a" }, { id: "b" }] });
    const todos = await new TodoClient(fetcher, BASE).listTodos();
    expect(todos.map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("returns [] when the server omits the todos field", async () => {
    const { fetcher } = stub({});
    expect(await new TodoClient(fetcher, BASE).listTodos()).toEqual([]);
  });

  test("forwards a filter as the project_id query param", async () => {
    const { fetcher, seen } = stub({ todos: [] });
    await new TodoClient(fetcher, BASE).listTodos("inbox");
    expect(new URL(seen[0]!.url).searchParams.get("project_id")).toBe("inbox");
  });

  test("omits project_id entirely when no filter is given", async () => {
    const { fetcher, seen } = stub({ todos: [] });
    await new TodoClient(fetcher, BASE).listTodos();
    expect(new URL(seen[0]!.url).searchParams.has("project_id")).toBe(false);
  });
});

describe("TodoClient.getTodo", () => {
  test("percent-encodes the id in the path", async () => {
    const { fetcher, seen } = stub({ id: "x" });
    await new TodoClient(fetcher, BASE).getTodo("a/b");
    expect(seen[0]!.url).toBe(`${BASE}/v1/todos/a%2Fb`);
  });
});

describe("TodoClient.createTodo", () => {
  test("sends only title when no opts are provided", async () => {
    const { fetcher, seen } = stub({ id: "x" });
    await new TodoClient(fetcher, BASE).createTodo("buy milk");
    expect(seen[0]!.method).toBe("POST");
    expect(await seen[0]!.json()).toEqual({ title: "buy milk" });
  });

  test("includes project_id and description when set", async () => {
    const { fetcher, seen } = stub({ id: "x" });
    await new TodoClient(fetcher, BASE).createTodo("t", {
      projectId: "p1",
      description: "body",
    });
    expect(await seen[0]!.json()).toEqual({
      title: "t",
      project_id: "p1",
      description: "body",
    });
  });

  test("forwards an explicit empty description (distinct from absent)", async () => {
    const { fetcher, seen } = stub({ id: "x" });
    await new TodoClient(fetcher, BASE).createTodo("t", { description: "" });
    expect(await seen[0]!.json()).toEqual({ title: "t", description: "" });
  });
});

describe("TodoClient.updateTodo", () => {
  test("maps title/done and only patches provided fields", async () => {
    const { fetcher, seen } = stub({ id: "x" });
    await new TodoClient(fetcher, BASE).updateTodo("id1", { done: true });
    expect(seen[0]!.method).toBe("PATCH");
    expect(seen[0]!.url).toBe(`${BASE}/v1/todos/id1`);
    expect(await seen[0]!.json()).toEqual({ done: true });
  });

  test("an empty-string description round-trips as a clear", async () => {
    const { fetcher, seen } = stub({ id: "x" });
    await new TodoClient(fetcher, BASE).updateTodo("id1", { description: "" });
    expect(await seen[0]!.json()).toEqual({ description: "" });
  });

  test("an omitted description leaves the field untouched", async () => {
    const { fetcher, seen } = stub({ id: "x" });
    await new TodoClient(fetcher, BASE).updateTodo("id1", { title: "renamed" });
    expect(await seen[0]!.json()).toEqual({ title: "renamed" });
  });
});

describe("TodoClient.deleteTodo", () => {
  test("issues a DELETE to the id path", async () => {
    const { fetcher, seen } = stub();
    await new TodoClient(fetcher, BASE).deleteTodo("id1");
    expect(seen[0]!.method).toBe("DELETE");
    expect(seen[0]!.url).toBe(`${BASE}/v1/todos/id1`);
  });
});
