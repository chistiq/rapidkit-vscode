export const STUDIO_PLAN_SECTIONS = [
  'scope',
  'evidence',
  'steps',
  'verification',
  'rollback',
  'assumptions',
] as const;

export type StudioImplementationPlan = Record<
  (typeof STUDIO_PLAN_SECTIONS)[number],
  { heading: string; body: string }
>;

const sectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['heading', 'body'],
  properties: {
    heading: { type: 'string', minLength: 1, maxLength: 160 },
    body: { type: 'string', minLength: 1, maxLength: 12_000 },
  },
};

/** Stable data keys; all displayed headings and content follow the user's language. */
export const STUDIO_IMPLEMENTATION_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...STUDIO_PLAN_SECTIONS],
  properties: Object.fromEntries(STUDIO_PLAN_SECTIONS.map((key) => [key, sectionSchema])),
};

export function parseStudioImplementationPlan(raw: unknown): StudioImplementationPlan | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some((key) => !STUDIO_PLAN_SECTIONS.includes(key as never))) {
    return undefined;
  }
  for (const key of STUDIO_PLAN_SECTIONS) {
    const section = record[key] as { heading?: unknown; body?: unknown } | undefined;
    if (
      !section ||
      typeof section !== 'object' ||
      Array.isArray(section) ||
      Object.keys(section).some((field) => field !== 'heading' && field !== 'body') ||
      typeof section.heading !== 'string' ||
      !section.heading.trim() ||
      section.heading.length > 160 ||
      /[\r\n]/.test(section.heading) ||
      typeof section.body !== 'string' ||
      !section.body.trim() ||
      section.body.length > 12_000
    ) {
      return undefined;
    }
  }
  return Object.fromEntries(
    STUDIO_PLAN_SECTIONS.map((key) => {
      const section = record[key] as { heading: string; body: string };
      return [key, { heading: section.heading.trim(), body: section.body.trim() }];
    })
  ) as StudioImplementationPlan;
}

export function renderStudioImplementationPlan(plan: StudioImplementationPlan): string {
  return STUDIO_PLAN_SECTIONS.map((key) => `## ${plan[key].heading}\n\n${plan[key].body}`).join(
    '\n\n'
  );
}
