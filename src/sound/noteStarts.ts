/** When each sounding note starts, so that no note is ended before it has started. */
export class NoteStarts {
  private starts = new Map<number, number | undefined>(); // undefined = started "now"

  /** `gap`: how soon after its start a note may end, in the caller's time unit. */
  constructor(private gap: number) {}

  has(note: number): boolean {
    return this.starts.has(note);
  }

  start(note: number, at?: number): void {
    this.starts.set(note, at);
  }

  /** Forgets `note` and returns when to end it: at `at` (undefined = now), but never before its start. */
  end(note: number, at?: number): number | undefined {
    const start = this.starts.get(note);
    this.starts.delete(note);
    if (start === undefined) return at;
    return at === undefined ? start + this.gap : Math.max(at, start + this.gap);
  }

  /** Ends and forgets every note; returns [note, end time] pairs as `end` computes them. */
  endAll(at?: number): [number, number | undefined][] {
    return [...this.starts.keys()].map((note) => [note, this.end(note, at)]);
  }
}
