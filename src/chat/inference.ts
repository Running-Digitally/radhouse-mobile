import { SessionError } from '../auth/types';
import { object } from '../auth/transfer';

export type Selection = Readonly<{
  provider?: string;
  model: string | null;
  thinking: string;
}>;
export type Model = Readonly<{
  provider?: string;
  id: string;
  label: string;
  available: boolean;
  thinking: {
    state: string;
    choices: string[];
    can_disable: boolean;
    can_enable: boolean;
  };
}>;
export type Catalog = Readonly<{
  current_model: string | null;
  models: Model[];
}>;
export function readCatalog(value: unknown): Catalog {
  const data = object(value);
  if (
    data.schema !== 'radhouse.inference.v1' ||
    !Array.isArray(data.models) ||
    data.models.length > 500
  ) {
    throw new SessionError('invalid');
  }
  const engines = Array.isArray(data.engines) ? data.engines.map(object) : [];
  const models = data.models.map(raw => {
    const row = object(raw),
      caps = object(row.thinking);
    if (
      typeof row.id !== 'string' ||
      typeof row.label !== 'string' ||
      typeof row.available !== 'boolean' ||
      (row.provider !== undefined && typeof row.provider !== 'string') ||
      typeof caps.state !== 'string' ||
      !Array.isArray(caps.choices) ||
      !caps.choices.every(
        choice => typeof choice === 'string' && /^[a-z]{1,20}$/.test(choice),
      ) ||
      typeof caps.can_disable !== 'boolean' ||
      typeof caps.can_enable !== 'boolean'
    ) {
      throw new SessionError('invalid');
    }
    const engine = engines.find(item => item.id === row.provider);
    return {
      id: row.id,
      provider: row.provider as string | undefined,
      label:
        typeof engine?.label === 'string'
          ? `${engine.label} · ${row.label}`
          : row.label,
      available: row.available && data.state === 'available',
      thinking: {
        state: caps.state,
        choices: caps.choices as string[],
        can_disable: caps.can_disable,
        can_enable: caps.can_enable,
      },
    };
  });
  return {
    current_model:
      typeof data.current_model === 'string' ? data.current_model : null,
    models,
  };
}
export function thinkingChoices(model?: Model): string[] {
  if (!model?.available || model.thinking.state !== 'supported') {
    return ['default'];
  }
  return [
    'default',
    ...(model.thinking.can_enable ? ['on'] : []),
    ...(model.thinking.can_disable ? ['off'] : []),
    ...model.thinking.choices,
  ];
}
export function selectedModel(
  catalog: Catalog | null,
  selection: Selection | null,
) {
  return catalog?.models.find(
    row => row.id === selection?.model && row.provider === selection?.provider,
  );
}
export function selectionAvailable(
  catalog: Catalog | null,
  selection: Selection | null,
) {
  return (
    !selection ||
    (thinkingChoices(selectedModel(catalog, selection)).includes(
      selection.thinking,
    ) &&
      selectedModel(catalog, selection)?.available === true)
  );
}
export function selectionLabel(selection: Selection | null) {
  if (!selection) {
    return 'Default model';
  }
  return `${selection.model} · ${
    selection.thinking === 'default' ? 'Default thinking' : selection.thinking
  }`;
}
