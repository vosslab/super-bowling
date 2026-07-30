import type { SimulationEvent, SimulationRequest } from "../simulation/protocol";

export type SimulationClient = {
  send(request: SimulationRequest): void;
  subscribe(listener: (event: SimulationEvent) => void): () => void;
  dispose(): void;
};

export type WorkerLike = {
  postMessage(message: SimulationRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<SimulationEvent>) => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<SimulationEvent>) => void,
  ): void;
};

export function create_worker_simulation_client(worker: WorkerLike): SimulationClient {
  const listeners = new Set<(event: SimulationEvent) => void>();

  function receive(event: MessageEvent<SimulationEvent>): void {
    for (const listener of listeners) listener(event.data);
  }

  worker.addEventListener("message", receive);

  function send(request: SimulationRequest): void {
    worker.postMessage(request);
  }

  function subscribe(listener: (event: SimulationEvent) => void): () => void {
    listeners.add(listener);
    function unsubscribe(): void {
      listeners.delete(listener);
    }
    return unsubscribe;
  }

  function dispose(): void {
    listeners.clear();
    worker.removeEventListener("message", receive);
    worker.postMessage({ type: "dispose" });
    worker.terminate();
  }

  return { send, subscribe, dispose };
}

export function create_simulation_client(): SimulationClient {
  const worker = new Worker("./simulation_worker.js", { type: "module" });
  return create_worker_simulation_client(worker);
}
