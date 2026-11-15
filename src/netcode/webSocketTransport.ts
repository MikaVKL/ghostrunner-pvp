/**
 * Opens a WebSocket and adapts it to the Transport interface.
 * Uses the global `WebSocket`, which exists in browsers and in Node.js 22+,
 * so the browser client and the bots share this file.
 */
import type { Transport } from '../shared/protocol/transport';

/** Resolves once the connection is open. Rejects if it cannot be established. */
export function connectWebSocket(url: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let opened = false;

    const transport: Transport = {
      send: (data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data);
      },
      close: () => socket.close(),
      onMessage: () => {},
      onClose: () => {},
    };

    socket.onopen = () => {
      opened = true;
      resolve(transport);
    };
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') transport.onMessage(event.data);
    };
    socket.onclose = () => {
      if (opened) transport.onClose();
      else reject(new Error(`Could not connect to ${url}`));
    };
    socket.onerror = () => socket.close();
  });
}
