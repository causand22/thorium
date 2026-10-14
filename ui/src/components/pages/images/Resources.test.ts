import { describe, expect, it } from 'vitest';

// project imports
import { apiToForm, formToApi, validateResources } from './Resources';
import { CpuUnit, MemoryUnit } from '@utilities/resources';

describe('apiToForm', () => {
  it('takes each unit from the value suffix', () => {
    const { form, parseErrors } = apiToForm({
      cpu: '500m',
      memory: '2Gi',
      ephemeral_storage: '512Mi',
      burstable: { cpu: '2', memory: '4096Mi' },
    });
    expect(parseErrors).toEqual({});
    expect(form).toMatchObject({
      cpu: '500',
      cpu_units: CpuUnit.mCPU,
      memory: '2',
      memory_units: MemoryUnit.Gi,
      ephemeral_storage: '512',
      ephemeral_storage_units: MemoryUnit.Mi,
      burstable_cpu: '2',
      burstable_cpu_units: CpuUnit.CPU,
      burstable_memory: '4096',
      burstable_memory_units: MemoryUnit.Mi,
    });
  });

  it('defaults empty fields to CPU and Gi', () => {
    const { form } = apiToForm({});
    expect(form).toMatchObject({ cpu: '', cpu_units: CpuUnit.CPU, memory: '', memory_units: MemoryUnit.Gi });
  });

  it('blanks invalid quantities and reports them by form field', () => {
    const { form, parseErrors } = apiToForm({ cpu: '1.5', memory: 2048 as unknown as string, burstable: { memory: '4G' } });
    expect(form).toMatchObject({ cpu: '', memory: '', burstable_memory: '' });
    expect(Object.keys(parseErrors).sort()).toEqual(['burstable_memory', 'cpu', 'memory']);
  });
});

describe('form <-> editor round trip', () => {
  it.each([
    { cpu: '2', memory: '2Gi' },
    { cpu: '2000m', memory: '2048Mi' },
    { cpu: '500m', memory: '512Mi', ephemeral_storage: '8Gi', nvidia_gpu: 1, amd_gpu: 2, burstable: { cpu: '4', memory: '8Gi' } },
  ])('keeps %j unchanged', (resources) => {
    expect(formToApi(apiToForm(resources).form)).toEqual(resources);
  });

  it('keeps the unit the user picked rather than normalizing it', () => {
    const { form } = apiToForm({ cpu: '1000m', memory: '1024Mi' });
    expect(formToApi(form)).toEqual({ cpu: '1000m', memory: '1024Mi' });
  });
});

describe('formToApi', () => {
  it('omits empty fields instead of filling in zero', () => {
    const { form } = apiToForm({ cpu: '1', memory: '1Gi' });
    expect(formToApi({ ...form, memory: '' })).toEqual({ cpu: '1' });
    expect(formToApi(apiToForm({}).form)).toEqual({});
  });
});

describe('validateResources', () => {
  it('requires cpu and memory together and enforces the minimums', () => {
    const base = apiToForm({}).form;
    expect(validateResources({ ...base, memory: '1', memory_units: MemoryUnit.Gi })).toHaveProperty('cpu');
    expect(validateResources({ ...base, cpu: '100', cpu_units: CpuUnit.mCPU, memory: '1' })).toHaveProperty('cpu');
    expect(validateResources({ ...base, cpu: '1', memory: '100', memory_units: MemoryUnit.Mi })).toHaveProperty('memory');
    expect(validateResources({ ...base, cpu: '1', memory: '1' })).toEqual({});
  });
});
