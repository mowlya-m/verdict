/**
 * Client for the decision service.
 *
 * The engine is the source of truth for every outcome. This file transports
 * and surfaces errors; it computes nothing. There is deliberately no decision
 * logic anywhere in it.
 */

const BASE = import.meta.env?.VITE_API_URL ?? '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function post(path, body, asAt) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (asAt) url.searchParams.set('as_at', asAt);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the decision service. Is the API running on :8000?', 0);
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const payload = await res.json();
      if (typeof payload.detail === 'string') detail = payload.detail;
      else if (Array.isArray(payload.detail)) {
        detail = payload.detail.map((e) => `${e.loc?.join('.')}: ${e.msg}`).join('; ');
      }
    } catch {
      /* body was not JSON; keep the status message */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json();
}

export const decideMotor = (claim, asAt) => post('/claims/motor/decide', claim, asAt);

/**
 * Read a claimant's own words into structured facts.
 *
 * Returns evidence, never an outcome. Feed the result to decideMotor once the
 * gaps it reports in `missing` have been filled.
 */
export const extractIntake = (narrative, referenceDate) =>
  post('/intake/extract', { narrative, reference_date: referenceDate ?? null });
export const decideHealth = (claim, asAt) => post('/claims/health/decide', claim, asAt);

/**
 * What single change would alter this outcome.
 *
 * Each lever is the engine re-run with one fact flipped, so the money is
 * arithmetic. Facts a claimant could only change by misrepresenting the loss
 * come back as `immovable` with a null outcome and are never actionable.
 */
export const counterfactual = (claim, asAt) =>
  post('/claims/motor/counterfactual', claim, asAt);

export async function serviceUp() {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export { ApiError };
