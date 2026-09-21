import type { AgentView, AssetClass } from "@/lib/contracts/types";
import { ASSET_CLASSES } from "@/lib/contracts/types";

/**
 * Black-Litterman posterior returns.
 *
 * The problem it solves is real and shows up immediately in this product:
 * feeding raw expected returns into a mean-variance optimiser produces absurd,
 * unstable portfolios — nudge one return assumption by a tenth of a percent
 * and the optimiser moves half the book. Black-Litterman fixes that by
 * starting from the returns the market *already* implies and treating each
 * desk's opinion as evidence that shifts them, weighted by how sure that desk
 * is. A confident view moves the answer; a hesitant one barely does.
 *
 * The chain, in the standard notation:
 *
 *   Π  = δ Σ w        equilibrium returns, reverse-optimised from held weights
 *   E[R] = [(τΣ)⁻¹ + PᵀΩ⁻¹P]⁻¹ [(τΣ)⁻¹Π + PᵀΩ⁻¹Q]
 *
 * Views here are *absolute* and one per asset class — "the gold desk thinks
 * gold returns 2% more than equilibrium" — so P is the identity and the
 * algebra stays legible. The matrix inverse is a plain Gauss-Jordan below,
 * written out rather than pulled from a dependency, because six by six is
 * small enough that the honesty of being able to read it is worth more than
 * the convenience.
 */

/** Risk aversion. 2.5 is the conventional value for reverse optimisation. */
export const DELTA = 2.5;

/**
 * Uncertainty in the equilibrium itself. Small on purpose: τ near 1 would say
 * the market's own prices tell us almost nothing, which is not a claim a
 * wealth product should be making.
 */
export const TAU = 0.05;

/**
 * How far a maximally confident desk may move one class, in annual return.
 * A committee of opinionated desks must not be able to invent a 40% asset.
 */
export const MAX_VIEW_SHIFT = 0.04;

type Matrix = number[][];
type Vector = number[];

/** Equilibrium excess returns implied by a set of held weights: Π = δΣw. */
export function impliedReturns(cov: Matrix, weights: Vector, delta = DELTA): Vector {
  return cov.map((row) => delta * row.reduce((s, c, j) => s + c * weights[j], 0));
}

export interface BlView {
  /** Index into ASSET_CLASSES. */
  asset: number;
  /** Absolute expected return for that asset. */
  q: number;
  /** 0..1 — how sure the desk is. Drives Ω. */
  confidence: number;
}

/**
 * Turn the committee's tilts into Black-Litterman views.
 *
 * A tilt is a direction and a strength, not a return, so it is converted by
 * scaling `MAX_VIEW_SHIFT` — the most an opinion may be worth — and adding it
 * to that asset's equilibrium return. Desks that said nothing about an asset
 * produce no view for it, which is different from a view of zero: silence
 * leaves the equilibrium alone, whereas a zero view would actively argue the
 * market is wrong.
 */
export function viewsFromAgents(views: AgentView[], pi: Vector): BlView[] {
  const out: BlView[] = [];
  ASSET_CLASSES.forEach((cls, i) => {
    const opinions = views
      .map((v) => ({ tilt: v.tilt[cls as AssetClass], confidence: v.confidence }))
      .filter((o): o is { tilt: number; confidence: number } => typeof o.tilt === "number" && o.tilt !== 0);
    if (!opinions.length) return;

    const weight = opinions.reduce((s, o) => s + o.confidence, 0);
    const tilt = opinions.reduce((s, o) => s + o.tilt * o.confidence, 0) / (weight || 1);
    const confidence = Math.min(1, weight / opinions.length);
    out.push({ asset: i, q: pi[i] + clamp(tilt, -1, 1) * MAX_VIEW_SHIFT, confidence });
  });
  return out;
}

/**
 * The posterior.
 *
 * Ω is diagonal, scaled by each view's own uncertainty: the conventional
 * `ω = τ pΣpᵀ` divided by confidence, so a desk that is half sure has twice
 * the variance on its view and half the pull on the answer.
 */
export function posteriorReturns(
  cov: Matrix,
  pi: Vector,
  views: BlView[],
  tau = TAU,
): Vector {
  if (!views.length) return [...pi];

  const n = pi.length;
  const tauSigmaInv = invert(scale(cov, tau));

  // PᵀΩ⁻¹P and PᵀΩ⁻¹Q, built directly since every view is on a single asset.
  const ptOmegaP: Matrix = zeros(n, n);
  const ptOmegaQ: Vector = new Array(n).fill(0);

  for (const v of views) {
    const variance = tau * cov[v.asset][v.asset];
    // A view with no confidence is infinitely uncertain; floor it so the
    // reciprocal stays finite rather than producing NaN in the inverse.
    const omega = variance / Math.max(0.05, v.confidence);
    const precision = 1 / omega;
    ptOmegaP[v.asset][v.asset] += precision;
    ptOmegaQ[v.asset] += precision * v.q;
  }

  const lhs = add(tauSigmaInv, ptOmegaP);
  const rhs = addVec(multiplyVec(tauSigmaInv, pi), ptOmegaQ);
  return multiplyVec(invert(lhs), rhs);
}

// ── Small dense linear algebra. Six by six; readability beats a dependency. ──

function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function scale(m: Matrix, k: number): Matrix {
  return m.map((row) => row.map((x) => x * k));
}

function add(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((x, j) => x + b[i][j]));
}

function addVec(a: Vector, b: Vector): Vector {
  return a.map((x, i) => x + b[i]);
}

function multiplyVec(m: Matrix, v: Vector): Vector {
  return m.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
}

/**
 * Gauss-Jordan with partial pivoting.
 *
 * Returns the identity if the matrix is singular rather than throwing: a
 * degenerate covariance must degrade the optimiser to "no adjustment", not
 * take down a page that is otherwise showing the customer real data.
 */
export function invert(m: Matrix): Matrix {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...unit(n, i)]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return identity(n);
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const d = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function unit(n: number, i: number): Vector {
  const v = new Array(n).fill(0);
  v[i] = 1;
  return v;
}

function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => unit(n, i));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
