/** Isolated proof receiver. Persists hashes and counters, never raw event content or secrets. */
interface ReceiverEnv {
  DB: D1Database;
  SIGNING_SECRET?: string;
  READ_TOKEN?: string;
}
const encoder = new TextEncoder();
export default {
  async fetch(request: Request, env: ReceiverEnv) {
    const url = new URL(request.url);
    if (url.pathname === '/health')
      return Response.json({ service: 'zine-webhook-verifier', status: 'ok' });
    if (!env.SIGNING_SECRET || !env.READ_TOKEN) return new Response(null, { status: 503 });
    if (request.method === 'GET' && url.pathname.startsWith('/proof/')) {
      if (request.headers.get('authorization') !== 'Bearer ' + env.READ_TOKEN)
        return new Response(null, { status: 401 });
      const row = await env.DB.prepare(
        'SELECT delivery_id AS deliveryId,event_id AS eventId,body_sha256 AS bodySha256,attempts,accepted,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt FROM receipts WHERE delivery_id=?'
      )
        .bind(url.pathname.slice(7))
        .first();
      return Response.json(row, { status: row ? 200 : 404 });
    }
    if (url.pathname !== '/hook' || request.method !== 'POST')
      return new Response(null, { status: 404 });
    const timestamp = request.headers.get('x-zine-timestamp') ?? '',
      signature = request.headers.get('x-zine-signature') ?? '',
      deliveryId = request.headers.get('x-zine-delivery') ?? '';
    if (
      !/^\d+$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^v1=[a-f0-9]{64}$/.test(signature) ||
      !/^dlv_[a-z0-9_]+$/.test(deliveryId)
    )
      return new Response(null, { status: 401 });
    // Bound the streamed payload independently of Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 20000) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = new TextDecoder().decode(bytes);
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.SIGNING_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBytes = Uint8Array.from(signature.slice(3).match(/../g)!, (s) =>
      parseInt(s, 16)
    );
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        encoder.encode(timestamp + '.' + body)
      ))
    )
      return new Response(null, { status: 401 });
    let parsed: { deliveryId: string; event: { id: string } };
    try {
      parsed = JSON.parse(body);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (parsed.deliveryId !== deliveryId || typeof parsed.event?.id !== 'string')
      return new Response(null, { status: 400 });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
        b.toString(16).padStart(2, '0')
      ).join(''),
      at = new Date().toISOString();
    const row = await env.DB.prepare(
      `INSERT INTO receipts(delivery_id,event_id,body_sha256,attempts,accepted,first_seen_at,last_seen_at) VALUES(?,?,?,1,0,?,?)
    ON CONFLICT(delivery_id) DO UPDATE SET attempts=receipts.attempts+1,last_seen_at=excluded.last_seen_at
    RETURNING body_sha256,attempts`
    )
      .bind(deliveryId, parsed.event.id, hash, at, at)
      .first<{ body_sha256: string; attempts: number }>();
    if (row!.body_sha256 !== hash) return new Response(null, { status: 409 });
    // Deliberately fail the first valid delivery so the API must retry it.
    if (row!.attempts === 1) return new Response(null, { status: 503 });
    await env.DB.prepare('UPDATE receipts SET accepted=1 WHERE delivery_id=?')
      .bind(deliveryId)
      .run();
    return new Response(null, { status: 204 });
  },
};
