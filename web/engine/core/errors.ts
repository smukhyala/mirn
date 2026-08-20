/**
 * The single throw type from contract validation.
 *
 * Mirrors the Python side's house rule from `src/mirn/contracts.py`: a violated invariant is
 * always an error, never a warning and never a silent coercion. One type means a caller has
 * exactly one thing to catch, the same way `Experiment.resolve` raises only `ValueError` so the
 * API layer had exactly one status to map.
 */
export class ContractError extends Error {
  override readonly name = "ContractError";

  constructor(message: string) {
    super(message);
  }
}

export function fail(message: string): never {
  throw new ContractError(message);
}

export function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    fail(`${label} must be finite, got ${value}`);
  }
}
