export type ForegroundJobTask = (onTerminal: () => void) => Promise<void> | void;

type QueueState = {
  active: number;
  limit: number;
  pending: ForegroundJobTask[];
};

export class ForegroundJobScheduler {
  private readonly queues = new Map<string, QueueState>();

  enqueue(key: string, concurrencyLimit: number, tasks: ForegroundJobTask[]) {
    if (tasks.length === 0) return;
    const queue = this.queues.get(key) ?? { active: 0, limit: 1, pending: [] };
    queue.limit = Math.max(1, Math.trunc(concurrencyLimit) || 1);
    queue.pending.push(...tasks);
    this.queues.set(key, queue);
    this.pump(key, queue);
  }

  cancelPending(key: string) {
    const queue = this.queues.get(key);
    if (!queue) return;
    queue.pending.length = 0;
    if (queue.active === 0) this.queues.delete(key);
  }

  snapshot(key: string) {
    const queue = this.queues.get(key);
    return queue ? { active: queue.active, pending: queue.pending.length, limit: queue.limit } : null;
  }

  private pump(key: string, queue: QueueState) {
    while (queue.active < queue.limit && queue.pending.length > 0) {
      const task = queue.pending.shift()!;
      queue.active += 1;
      let finished = false;
      const onTerminal = () => {
        if (finished) return;
        finished = true;
        queue.active = Math.max(0, queue.active - 1);
        if (queue.active === 0 && queue.pending.length === 0) {
          this.queues.delete(key);
          return;
        }
        this.pump(key, queue);
      };
      try {
        Promise.resolve(task(onTerminal)).catch(onTerminal);
      } catch {
        onTerminal();
      }
    }
  }
}

export const foregroundJobScheduler = new ForegroundJobScheduler();
