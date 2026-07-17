import { describe, expect, it, vi } from "vitest";
import { CompletedTurnQueue } from "./completed-turn-queue";

type Route = "edit" | "stop";

describe("CompletedTurnQueue", () => {
  it("routes each identifier once, including duplicates received after completion", async () => {
    const handled = vi.fn();
    const queue = new CompletedTurnQueue<Route>({
      classify: (turn) => turn.text as Route,
      canProcess: () => true,
      isStop: (route) => route === "stop",
      onTurn: ({ transcript }) => handled(transcript.id),
    });
    queue.start();

    await queue.enqueue({ id: "one", text: "edit" }).completed;
    const duplicate = queue.enqueue({ id: "one", text: "edit" });

    expect(handled).toHaveBeenCalledTimes(1);
    expect(duplicate).toMatchObject({ accepted: false, stop: false });
  });

  it("queues turns while busy and processes them in arrival order after resume", async () => {
    let available = false;
    const handled: string[] = [];
    const queue = new CompletedTurnQueue<Route>({
      classify: (turn) => turn.text as Route,
      canProcess: () => available,
      isStop: () => false,
      onTurn: ({ transcript }) => { handled.push(transcript.id); },
    });
    queue.start();
    const first = queue.enqueue({ id: "one", text: "edit" });
    const second = queue.enqueue({ id: "two", text: "edit" });

    expect(handled).toEqual([]);
    available = true;
    queue.resume();
    await Promise.all([first.completed, second.completed]);

    expect(handled).toEqual(["one", "two"]);
  });

  it("gives Stop priority and clears queued mutations", async () => {
    let release!: () => void;
    const firstHandled = new Promise<void>((resolve) => { release = resolve; });
    const handled: string[] = [];
    const queue = new CompletedTurnQueue<Route>({
      classify: (turn) => turn.text as Route,
      canProcess: () => true,
      isStop: (route) => route === "stop",
      onTurn: async ({ transcript }) => {
        handled.push(transcript.id);
        if (transcript.id === "one") await firstHandled;
      },
    });
    queue.start();
    const first = queue.enqueue({ id: "one", text: "edit" });
    const queued = queue.enqueue({ id: "two", text: "edit" });
    const stop = queue.enqueue({ id: "three", text: "stop" });
    release();
    await Promise.all([first.completed, queued.completed, stop.completed]);

    expect(stop).toMatchObject({ accepted: true, stop: true });
    expect(handled).toEqual(["one", "three"]);
  });
});
