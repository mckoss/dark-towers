/**
 * Smooth interpolation between ADS-B points.
 *
 * Tracks are sampled irregularly (often 5–60 s apart). For drawing and for
 * accelerated replay we fit a time-parameterised Catmull-Rom spline through
 * the reported points and express each segment as a cubic Bézier. The curve
 * passes through every reported position and its tangents respect the timing
 * of neighbouring points, so a sampled position is where the aircraft really
 * was to within the data's own accuracy.
 */

export interface TimedPoint {
	t: number;
	/** Any number of channels (e.g. [x, y, alt]). */
	v: number[];
}

export interface BezierSegment {
	t0: number;
	t1: number;
	p0: number[];
	c1: number[];
	c2: number[];
	p3: number[];
}

const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
const mul = (a: number[], k: number) => a.map((x) => x * k);

/**
 * Tangent (per unit time) at point i using neighbours, for a non-uniform
 * Catmull-Rom spline. End points use one-sided differences.
 */
function tangent(pts: TimedPoint[], i: number): number[] {
	const n = pts.length;
	if (n < 2) return pts[0].v.map(() => 0);
	if (i === 0) return mul(sub(pts[1].v, pts[0].v), 1 / Math.max(1e-9, pts[1].t - pts[0].t));
	if (i === n - 1) return mul(sub(pts[n - 1].v, pts[n - 2].v), 1 / Math.max(1e-9, pts[n - 1].t - pts[n - 2].t));
	const prev = pts[i - 1],
		cur = pts[i],
		next = pts[i + 1];
	const dtA = Math.max(1e-9, cur.t - prev.t);
	const dtB = Math.max(1e-9, next.t - cur.t);
	// Weighted average of the two one-sided velocities (Catmull-Rom with
	// non-uniform parameterisation).
	const vA = mul(sub(cur.v, prev.v), 1 / dtA);
	const vB = mul(sub(next.v, cur.v), 1 / dtB);
	return mul(add(mul(vA, dtB), mul(vB, dtA)), 1 / (dtA + dtB));
}

/** Cubic Bézier control points for every interval between consecutive points. */
export function bezierSegments(pts: TimedPoint[]): BezierSegment[] {
	const out: BezierSegment[] = [];
	for (let i = 0; i < pts.length - 1; i++) {
		const a = pts[i],
			b = pts[i + 1];
		const dt = Math.max(1e-9, b.t - a.t);
		const ta = tangent(pts, i),
			tb = tangent(pts, i + 1);
		out.push({
			t0: a.t,
			t1: b.t,
			p0: a.v,
			c1: add(a.v, mul(ta, dt / 3)),
			c2: sub(b.v, mul(tb, dt / 3)),
			p3: b.v
		});
	}
	return out;
}

/** Evaluate a segment at u in [0,1]. */
export function evalSegment(s: BezierSegment, u: number): number[] {
	const mu = 1 - u;
	const a = mu * mu * mu,
		b = 3 * mu * mu * u,
		c = 3 * mu * u * u,
		d = u * u * u;
	return s.p0.map((_, i) => a * s.p0[i] + b * s.c1[i] + c * s.c2[i] + d * s.p3[i]);
}

/** Derivative (per unit time) at u in [0,1]. */
export function evalSegmentVelocity(s: BezierSegment, u: number): number[] {
	const mu = 1 - u;
	const dt = Math.max(1e-9, s.t1 - s.t0);
	return s.p0.map(
		(_, i) =>
			(3 * (mu * mu * (s.c1[i] - s.p0[i]) + 2 * mu * u * (s.c2[i] - s.c1[i]) + u * u * (s.p3[i] - s.c2[i]))) / dt
	);
}

export class Spline {
	readonly segments: BezierSegment[];
	readonly t0: number;
	readonly t1: number;
	constructor(public readonly points: TimedPoint[]) {
		this.segments = bezierSegments(points);
		this.t0 = points.length ? points[0].t : 0;
		this.t1 = points.length ? points[points.length - 1].t : 0;
	}

	private segmentAt(t: number): BezierSegment | null {
		const segs = this.segments;
		if (!segs.length) return null;
		let lo = 0,
			hi = segs.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (segs[mid].t1 < t) lo = mid + 1;
			else hi = mid;
		}
		return segs[lo];
	}

	/** Position at time t (clamped to the track's span). */
	at(t: number): number[] | null {
		if (!this.points.length) return null;
		if (this.points.length === 1 || t <= this.t0) return this.points[0].v;
		if (t >= this.t1) return this.points[this.points.length - 1].v;
		const s = this.segmentAt(t)!;
		return evalSegment(s, (t - s.t0) / Math.max(1e-9, s.t1 - s.t0));
	}

	/** Velocity (units per unit time) at t. */
	velocityAt(t: number): number[] | null {
		if (this.points.length < 2) return null;
		const tc = Math.min(Math.max(t, this.t0), this.t1);
		const s = this.segmentAt(tc)!;
		return evalSegmentVelocity(s, (tc - s.t0) / Math.max(1e-9, s.t1 - s.t0));
	}

	/** Sample the first two channels as an SVG path string. */
	svgPath(project: (v: number[]) => [number, number] = (v) => [v[0], v[1]], precision = 2): string {
		if (!this.points.length) return '';
		const f = (n: number) => n.toFixed(precision);
		const [x0, y0] = project(this.points[0].v);
		let d = `M${f(x0)},${f(y0)}`;
		for (const s of this.segments) {
			const [c1x, c1y] = project(s.c1),
				[c2x, c2y] = project(s.c2),
				[px, py] = project(s.p3);
			d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(px)},${f(py)}`;
		}
		return d;
	}
}
