/**
 * The body as text, or `null` past `limit` bytes.
 *
 * Every route here is public, so a body is refused from its declared length
 * before anything is read, and one without a length (chunked) is read only up
 * to the limit and then cancelled, rather than buffered whole and measured
 * afterwards. Bytes, not `string.length`, which counts UTF-16 units.
 */
export const readBounded = async (
  request: Request,
  limit: number,
): Promise<string | null> => {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};
