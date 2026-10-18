import log from "./logger.js";

const requests = [];
let blockedUntil = 0;

export async function checkNda(userId) {
  if (!/^[UW][A-Z0-9]{8,20}$/.test(userId)) return null;

  const now = Date.now();
  while (requests.length && requests[0] <= now - 1000) requests.shift();
  if (now < blockedUntil || requests.length >= 10) return null;
  requests.push(now);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(
      `https://nda.hackclub.com/api/v1/nda_status/${encodeURIComponent(userId)}`,
      { signal: controller.signal }
    );
    if (response.status === 429 || response.headers.get("RateLimit-Remaining") === "0") {
      const reset = Number(response.headers.get("RateLimit-Reset")) || 1;
      const retryAfter = Number(response.headers.get("Retry-After")) || 1;
      blockedUntil = Math.max(blockedUntil, Date.now() + Math.max(reset, retryAfter, 1) * 1000);
    }
    if (!response.ok) return null;

    const data = await response.json();
    return data.status === "signed" || data.status === "not_signed" ? data.status : null;
  } catch (err) {
    log.warn(`nda check failed for ${userId}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
