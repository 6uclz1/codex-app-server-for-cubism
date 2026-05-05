export type RuntimeEventHandler<TEvent> = (event: TEvent) => void;

export class RuntimeEventBus<TEvent> {
  private readonly handlers = new Set<RuntimeEventHandler<TEvent>>();

  subscribe(handler: RuntimeEventHandler<TEvent>): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: TEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
