import type { CompletedTranscript } from "./realtime-transcription-client";

export interface CompletedTurnReceipt<Route> {
  readonly accepted: boolean;
  readonly route?: Route;
  readonly stop: boolean;
  readonly completed: Promise<void>;
}

export interface CompletedTurnQueueOptions<Route> {
  readonly classify: (transcript: CompletedTranscript) => Route;
  readonly canProcess: () => boolean;
  readonly isStop: (route: Route) => boolean;
  readonly onTurn: (turn: { readonly transcript: CompletedTranscript; readonly route: Route }) => Promise<void> | void;
}

interface QueuedTurn<Route> {
  readonly transcript: CompletedTranscript;
  readonly route: Route;
  readonly resolve: () => void;
}

/** Serializes completed microphone turns and remembers every provider identifier it accepts. */
export class CompletedTurnQueue<Route> {
  private readonly seenIds = new Set<string>();
  private readonly turns: QueuedTurn<Route>[] = [];
  private active = false;
  private handling = false;

  constructor(private readonly options: CompletedTurnQueueOptions<Route>) {}

  start(): void {
    this.active = true;
    this.drain();
  }

  stop(): void {
    this.active = false;
    while (this.turns.length > 0) this.turns.shift()?.resolve();
  }

  resume(): void {
    this.drain();
  }

  enqueue(transcript: CompletedTranscript): CompletedTurnReceipt<Route> {
    if (this.seenIds.has(transcript.id)) return { accepted: false, stop: false, completed: Promise.resolve() };

    this.seenIds.add(transcript.id);
    const route = this.options.classify(transcript);
    if (this.options.isStop(route)) {
      this.stop();
      const completed = Promise.resolve(this.options.onTurn({ transcript, route }));
      return { accepted: true, route, stop: true, completed };
    }

    let resolve!: () => void;
    const completed = new Promise<void>((done) => { resolve = done; });
    this.turns.push({ transcript, route, resolve });
    this.drain();
    return { accepted: true, route, stop: false, completed };
  }

  private drain(): void {
    if (!this.active || this.handling || !this.options.canProcess()) return;
    const turn = this.turns.shift();
    if (!turn) return;

    this.handling = true;
    void Promise.resolve(this.options.onTurn(turn)).catch(() => undefined).finally(() => {
      turn.resolve();
      this.handling = false;
      this.drain();
    });
  }
}
