import assert from "node:assert/strict";
import test from "node:test";

import { create_worker_simulation_client } from "../src/app/simulation_client.ts";

class FakeWorker extends EventTarget {
  constructor() {
    super();
    this.requests = [];
    this.terminated = false;
  }

  postMessage(request) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  emit(event) {
    this.dispatchEvent(new MessageEvent("message", { data: event }));
  }
}

test("simulation client forwards requests and releases subscriptions", () => {
  const worker = new FakeWorker();
  const client = create_worker_simulation_client(worker);
  const events = [];
  const unsubscribe = client.subscribe((event) => events.push(event.type));
  client.send({ type: "initialize", pin_count: 10 });
  worker.emit({ type: "ready", pin_count: 10 });
  unsubscribe();
  worker.emit({ type: "fatal", message: "ignored" });
  assert.deepEqual(worker.requests, [{ type: "initialize", pin_count: 10 }]);
  assert.deepEqual(events, ["ready"]);
  client.dispose();
  assert.equal(worker.requests.at(-1).type, "dispose");
  assert.equal(worker.terminated, true);
});
