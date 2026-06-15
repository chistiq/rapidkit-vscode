import type { ModelSelectOption } from '@/components/ModelSelect';

export function resolveChatModelLabel(
  selectedModelId: string | null | undefined,
  models: ModelSelectOption[],
  preferredModelId?: string
): string {
  const effectiveId =
    selectedModelId ?? (preferredModelId && preferredModelId !== 'auto' ? preferredModelId : null);

  if (!effectiveId) {
    return 'Auto';
  }

  const match = models.find((model) => model.id === effectiveId);
  return match?.name ?? effectiveId;
}
