// Collects small writes and flushes them together. Built for page-view pings:
// one open tab pings on a timer, so with tens of thousands of students the
// naive one-insert-per-ping turns into thousands of database writes a second.
// Batching turns that into one insertMany every few seconds.
//
// The buffer is bounded. If the database is down or slow the oldest events are
// dropped rather than letting memory grow — analytics are best-effort and must
// never be the thing that takes the app down.
export class BatchBuffer {
  constructor(flushFn, { maxItems = 5000, intervalMs = 5000, batchSize = 1000, onError = () => {}, setInterval: si = setInterval } = {}) {
    this.flushFn = flushFn;
    this.maxItems = maxItems;
    this.batchSize = batchSize;
    this.onError = onError;
    this.items = [];
    this.dropped = 0;
    this.flushing = false;
    this.timer = intervalMs > 0 ? si(() => { this.flush(); }, intervalMs) : null;
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
  }

  push(item) {
    if (this.items.length >= this.maxItems) { this.items.shift(); this.dropped += 1; }
    this.items.push(item);
  }

  async flush() {
    if (this.flushing || this.items.length === 0) return 0;
    this.flushing = true;
    let sent = 0;
    try {
      while (this.items.length) {
        const batch = this.items.splice(0, this.batchSize);
        try {
          await this.flushFn(batch);
          sent += batch.length;
        } catch (err) {
          this.onError(err, batch.length);   // this batch is lost; keep going with the rest
        }
      }
    } finally {
      this.flushing = false;
    }
    return sent;
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this.flush();
  }
}
