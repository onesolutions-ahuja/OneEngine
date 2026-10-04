const inputTypes = { Text: 'text', Number: 'number', Currency: 'number', Boolean: 'boolean', Date: 'date', 'Date/Time': 'datetime', Record: 'record' };

export function workflowInputContract(declared = [], resources = []) {
  const entries = new Map(declared.filter(input => input?.name).map(input => [input.name, { ...input }]));
  for (const resource of resources) {
    if (resource?.type !== 'Variable' || !(resource.availableInput || resource.availableForInput)) continue;
    const name = resource.apiName || resource.value;
    if (!name || entries.has(name)) continue;
    entries.set(name, { name, label: resource.label || name, type: resource.isCollection ? 'collection' : inputTypes[resource.dataType] || 'text', ...(resource.defaultValue !== '' && resource.defaultValue !== undefined ? { defaultValue: resource.defaultValue } : {}) });
  }
  return [...entries.values()];
}

export function parseWorkflowInputs(contract, values) {
  const parsed = {};
  for (const input of contract) {
    const raw = values[input.name];
    if (raw === '' || raw === undefined) {
      if (input.required) throw new Error(`Enter the required input: ${input.label || input.name}`);
      continue;
    }
    if (['record', 'object', 'collection'].includes(input.type)) {
      let value;
      try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; }
      catch { throw new Error(`${input.label || input.name} must contain valid JSON`); }
      if (input.type === 'collection' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${input.label || input.name} must be a JSON ${input.type === 'collection' ? 'array' : 'object'}`);
      parsed[input.name] = value;
    } else parsed[input.name] = raw;
  }
  return parsed;
}
