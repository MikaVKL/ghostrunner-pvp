/**
 * A Transport is one end of a two-way text connection.
 *
 * Game code only talks to this interface, never to WebSocket directly. That is why the
 * same server and client code works with real WebSockets (browser, Node) and with the
 * in-memory fake network used by tests (src/bots/memoryNetwork.ts).
 */
export interface Transport {
  send(data: string): void;
  close(): void;
  /** Assign a function to receive incoming messages. */
  onMessage: (data: string) => void;
  /** Assign a function to be told when the connection ends. */
  onClose: () => void;
}
