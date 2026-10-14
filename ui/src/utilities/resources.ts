/**
 * Parsing, formatting, and validation of image resource quantities.
 *
 * The GET API returns cpu as an integer in millicpu and memory/storage as integers in MiB, but
 * the form and the YAML/JSON editor carry quantity strings that always state their unit:
 *  - cpu: an integer number of cores (`2`) or an integer number of millicores (`500m`)
 *  - memory/ephemeral storage: an integer number of `Mi` or `Gi` (`512Mi`, `2Gi`)
 *
 * Both views and the request builders share these helpers so a value never changes unit when
 * the user switches views.
 */

export enum CpuUnit {
  CPU = 'CPU',
  mCPU = 'mCPU',
}

export enum MemoryUnit {
  Gi = 'Gi',
  Mi = 'Mi',
}

/** A parsed quantity: an integer string (kept as a string for form inputs) and its unit. */
export interface Quantity<U> {
  value: string;
  unit: U;
}

/** Resources as held by the editor object (quantities as strings, GPUs as plain integers). */
export interface EditorResources {
  cpu?: number | string;
  memory?: number | string;
  ephemeral_storage?: number | string;
  worker_slots?: number;
  nvidia_gpu?: number;
  amd_gpu?: number;
  burstable?: {
    cpu?: number | string;
    memory?: number | string;
  };
}

const CPU_PATTERN = /^(\d+)(m?)$/;
const MEMORY_PATTERN = /^(\d+)(Mi|Gi)$/;

export const CPU_FORMAT_HINT = "an integer number of CPUs ('2') or millicores ('500m')";
export const MEMORY_FORMAT_HINT = "an integer with a 'Mi' or 'Gi' suffix (e.g. '512Mi', '2Gi')";

/**
 * Parse a cpu quantity. A bare integer is cores and an `m` suffix is millicores.
 *
 * @param raw - A YAML/JSON number or string.
 * @returns The parsed quantity, or `null` if it isn't an integer number of cores or millicores.
 */
export function parseCpu(raw: unknown): Quantity<CpuUnit> | null {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw >= 0 ? { value: String(raw), unit: CpuUnit.CPU } : null;
  }
  if (typeof raw !== 'string') return null;
  const match = CPU_PATTERN.exec(raw.trim());
  if (!match) return null;
  return { value: match[1], unit: match[2] === 'm' ? CpuUnit.mCPU : CpuUnit.CPU };
}

/**
 * Parse a memory or storage quantity. The `Mi` or `Gi` suffix is mandatory.
 *
 * @param raw - A YAML/JSON value; only strings can be valid.
 * @returns The parsed quantity, or `null` if it isn't an integer with a `Mi`/`Gi` suffix.
 */
export function parseMemory(raw: unknown): Quantity<MemoryUnit> | null {
  if (typeof raw !== 'string') return null;
  const match = MEMORY_PATTERN.exec(raw.trim());
  if (!match) return null;
  return { value: match[1], unit: match[2] as MemoryUnit };
}

/** Format a cpu value and unit as a quantity string (`2` or `500m`). */
export function formatCpu(value: string, unit: CpuUnit): string {
  return unit === CpuUnit.mCPU ? `${value}m` : value;
}

/** Format a memory value and unit as a quantity string (`512Mi`). */
export function formatMemory(value: string, unit: MemoryUnit): string {
  return `${value}${unit}`;
}

/** Describe why `raw` isn't a valid cpu quantity, or `null` if it is valid. */
export function cpuError(raw: unknown): string | null {
  return parseCpu(raw) ? null : `Invalid cpu '${String(raw)}'. Must be ${CPU_FORMAT_HINT}`;
}

/** Describe why `raw` isn't a valid memory/storage quantity, or `null` if it is valid. */
export function memoryError(raw: unknown): string | null {
  return parseMemory(raw) ? null : `Invalid quantity '${String(raw)}'. Must be ${MEMORY_FORMAT_HINT}`;
}

const isRecord = (val: unknown): val is Record<string, unknown> => typeof val === 'object' && val !== null && !Array.isArray(val);

function millicpuToQuantity(val: unknown): unknown {
  return typeof val === 'number' ? `${val}m` : val;
}

function mibToQuantity(val: unknown): unknown {
  return typeof val === 'number' ? `${val}Mi` : val;
}

/**
 * Convert resources as returned by the API (cpu in millicpu, memory/storage in MiB, all
 * integers) to the editor representation, e.g. `{ cpu: 1000, memory: 2048 }` becomes
 * `{ cpu: '1000m', memory: '2048Mi' }`. Values that are already strings are left alone.
 *
 * @param resources - The `resources` value from an API image.
 * @returns A new resources object, or `resources` unchanged if it isn't an object.
 */
export function resourcesToEditor(resources: unknown): unknown {
  if (!isRecord(resources)) return resources;
  const result: Record<string, unknown> = { ...resources };
  if ('cpu' in result) result.cpu = millicpuToQuantity(result.cpu);
  if ('memory' in result) result.memory = mibToQuantity(result.memory);
  if ('ephemeral_storage' in result) result.ephemeral_storage = mibToQuantity(result.ephemeral_storage);
  if (isRecord(result.burstable)) {
    const burstable: Record<string, unknown> = { ...result.burstable };
    if ('cpu' in burstable) burstable.cpu = millicpuToQuantity(burstable.cpu);
    if ('memory' in burstable) burstable.memory = mibToQuantity(burstable.memory);
    result.burstable = burstable;
  }
  return result;
}

/** Convert a parsed cpu quantity to millicpu. */
function cpuToMillicpu(q: Quantity<CpuUnit>): number {
  return Number(q.value) * (q.unit === CpuUnit.CPU ? 1000 : 1);
}

/** Convert a parsed memory quantity to MiB. */
function memoryToMib(q: Quantity<MemoryUnit>): number {
  return Number(q.value) * (q.unit === MemoryUnit.Gi ? 1024 : 1);
}

/**
 * Reduce editor resources to millicpu/MiB integers so two spellings of the same amount
 * (`1` and `1000m`, `1Gi` and `1024Mi`) compare equal. Values that don't parse are kept as is.
 */
export function canonicalResources(resources: unknown): unknown {
  if (!isRecord(resources)) return resources;
  const cpu = (val: unknown) => {
    const q = parseCpu(val);
    return q ? cpuToMillicpu(q) : val;
  };
  const memory = (val: unknown) => {
    const q = parseMemory(val);
    return q ? memoryToMib(q) : val;
  };
  const result: Record<string, unknown> = { ...resources };
  if ('cpu' in result) result.cpu = cpu(result.cpu);
  if ('memory' in result) result.memory = memory(result.memory);
  if ('ephemeral_storage' in result) result.ephemeral_storage = memory(result.ephemeral_storage);
  if (isRecord(result.burstable)) {
    const burstable: Record<string, unknown> = { ...result.burstable };
    if ('cpu' in burstable) burstable.cpu = cpu(burstable.cpu);
    if ('memory' in burstable) burstable.memory = memory(burstable.memory);
    result.burstable = burstable;
  }
  return result;
}

/**
 * Validate every quantity in an editor `resources` value.
 *
 * @param resources - The `resources` value from the editor object.
 * @returns One message per invalid field, keyed by dotted path (`cpu`, `burstable.memory`).
 */
export function validateResourceQuantities(resources: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isRecord(resources)) return errors;
  const check = (path: string, val: unknown, validator: (raw: unknown) => string | null) => {
    if (val === undefined || val === null) return;
    const err = validator(val);
    if (err) errors[path] = err;
  };
  check('cpu', resources.cpu, cpuError);
  check('memory', resources.memory, memoryError);
  check('ephemeral_storage', resources.ephemeral_storage, memoryError);
  if (isRecord(resources.burstable)) {
    check('burstable.cpu', resources.burstable.cpu, cpuError);
    check('burstable.memory', resources.burstable.memory, memoryError);
  }
  return errors;
}
