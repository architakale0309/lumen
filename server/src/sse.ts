import type { ServerEvent } from '@lumen/shared';

export function encodeEvent(event: ServerEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export class SseWriter {
  private controller: ReadableStreamDefaultController<Uint8Array>;
  private encoder = new TextEncoder();
  private closed = false;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  send(event: ServerEvent): void {
    if (this.closed) return;
    try {
      this.controller.enqueue(this.encoder.encode(encodeEvent(event)));
    } catch {
      this.closed = true;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.controller.close();
    } catch {
      // already closed
    }
  }
}
