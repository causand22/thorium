import { describe, it, expect } from 'vitest';

// project imports
import {
  CpuUnit,
  MemoryUnit,
  canonicalResources,
  cpuError,
  formatCpu,
  formatMemory,
  memoryError,
  parseCpu,
  parseMemory,
  resourcesToEditor,
  validateResourceQuantities,
} from './resources';

describe('parseCpu', () => {
  it('reads a bare integer as cores', () => {
    expect(parseCpu('2')).toEqual({ value: '2', unit: CpuUnit.CPU });
    expect(parseCpu(2)).toEqual({ value: '2', unit: CpuUnit.CPU });
  });

  it('reads an m suffix as millicores', () => {
    expect(parseCpu('500m')).toEqual({ value: '500', unit: CpuUnit.mCPU });
    expect(parseCpu(' 1000m ')).toEqual({ value: '1000', unit: CpuUnit.mCPU });
  });

  it.each(['', '0.5', '1.5', '-1', '1e3', '500M', '500mi', '1Gi', 'abc', '2 m'])('rejects %j', (raw) => {
    expect(parseCpu(raw)).toBeNull();
  });

  it('rejects non-integer numbers and other types', () => {
    expect(parseCpu(0.5)).toBeNull();
    expect(parseCpu(-1)).toBeNull();
    expect(parseCpu(null)).toBeNull();
    expect(parseCpu({})).toBeNull();
  });
});

describe('parseMemory', () => {
  it('requires a Mi or Gi suffix', () => {
    expect(parseMemory('512Mi')).toEqual({ value: '512', unit: MemoryUnit.Mi });
    expect(parseMemory('2Gi')).toEqual({ value: '2', unit: MemoryUnit.Gi });
  });

  it.each(['2048', '2G', '2M', '1.5Gi', '100Ki', '1Ti', '2gi', 'Gi', '', '-1Gi'])('rejects %j', (raw) => {
    expect(parseMemory(raw)).toBeNull();
  });

  it('rejects bare numbers', () => {
    expect(parseMemory(2048)).toBeNull();
  });
});

describe('format', () => {
  it('round-trips with the parsers', () => {
    expect(formatCpu('2', CpuUnit.CPU)).toBe('2');
    expect(formatCpu('500', CpuUnit.mCPU)).toBe('500m');
    expect(formatMemory('512', MemoryUnit.Mi)).toBe('512Mi');
    expect(formatMemory('2', MemoryUnit.Gi)).toBe('2Gi');
    const cpu = parseCpu('2000m')!;
    expect(formatCpu(cpu.value, cpu.unit)).toBe('2000m');
    const memory = parseMemory('4Gi')!;
    expect(formatMemory(memory.value, memory.unit)).toBe('4Gi');
  });
});

describe('errors', () => {
  it('describe invalid values and pass valid ones', () => {
    expect(cpuError('500m')).toBeNull();
    expect(cpuError('1.5')).toContain("Invalid cpu '1.5'");
    expect(memoryError('2Gi')).toBeNull();
    expect(memoryError('2048')).toContain("Invalid quantity '2048'");
  });
});

describe('resourcesToEditor', () => {
  it('converts API millicpu/MiB integers to suffixed quantities', () => {
    expect(
      resourcesToEditor({
        cpu: 1000,
        memory: 2048,
        ephemeral_storage: 512,
        worker_slots: 1,
        nvidia_gpu: 1,
        amd_gpu: 0,
        burstable: { cpu: 2000, memory: 4096 },
      }),
    ).toEqual({
      cpu: '1000m',
      memory: '2048Mi',
      ephemeral_storage: '512Mi',
      worker_slots: 1,
      nvidia_gpu: 1,
      amd_gpu: 0,
      burstable: { cpu: '2000m', memory: '4096Mi' },
    });
  });

  it('leaves strings and non-objects alone', () => {
    expect(resourcesToEditor({ cpu: '2', memory: '1Gi' })).toEqual({ cpu: '2', memory: '1Gi' });
    expect(resourcesToEditor(undefined)).toBeUndefined();
  });

  it('produces values that pass validation', () => {
    const res = resourcesToEditor({ cpu: 1500, memory: 3000, ephemeral_storage: 0, burstable: { cpu: 1, memory: 1 } });
    expect(validateResourceQuantities(res)).toEqual({});
  });
});

describe('canonicalResources', () => {
  it('treats different spellings of one amount as equal', () => {
    expect(canonicalResources({ cpu: '1', memory: '1Gi' })).toEqual(canonicalResources({ cpu: '1000m', memory: '1024Mi' }));
    expect(canonicalResources({ burstable: { cpu: '2', memory: '2Gi' } })).toEqual({ burstable: { cpu: 2000, memory: 2048 } });
  });

  it('keeps unparseable values so they never compare equal to valid ones', () => {
    expect(canonicalResources({ memory: '2048' })).toEqual({ memory: '2048' });
  });
});

describe('validateResourceQuantities', () => {
  it('accepts valid and absent values', () => {
    expect(validateResourceQuantities(undefined)).toEqual({});
    expect(validateResourceQuantities({ cpu: '1', memory: '1Gi', nvidia_gpu: 1, burstable: { cpu: '500m', memory: '512Mi' } })).toEqual({});
  });

  it('reports each invalid field by path', () => {
    const errors = validateResourceQuantities({
      cpu: '1.5',
      memory: 2048,
      ephemeral_storage: '8G',
      burstable: { cpu: '2x', memory: '4' },
    });
    expect(Object.keys(errors).sort()).toEqual(['burstable.cpu', 'burstable.memory', 'cpu', 'ephemeral_storage', 'memory']);
  });
});
