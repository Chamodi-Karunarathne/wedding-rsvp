import { getDb, type DbLike } from '@/db/client';
import { siteConfig } from '@/db/schema';
import {
  CONFIG_SCHEMAS,
  DEFAULT_MESSAGING_CONFIG,
  DEFAULT_PHASE_CONFIG,
  messagingConfigSchema,
  phaseConfigSchema,
  readSiteSettings,
  validatePhaseOrdering,
  type AppConfig,
  type ConfigKey,
} from '@/lib/domain/config';
import { currentPhase, sectionOrder, type Phase } from '@/lib/domain/phase';
import { ok, serviceError, type Result } from '@/lib/domain/result';

/** PERMANENT. All reads and writes of site_config. */

export async function getConfig(db: DbLike = getDb()): Promise<AppConfig> {
  const rows = await db.select().from(siteConfig);
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  // A missing or malformed key falls back to its default rather than throwing,
  // so a freshly migrated database still renders.
  const phase = phaseConfigSchema.safeParse(byKey.get('phase'));
  const messaging = messagingConfigSchema.safeParse(byKey.get('messaging'));

  return {
    phase: phase.success ? phase.data : DEFAULT_PHASE_CONFIG,
    site: readSiteSettings(byKey.get('site')),
    messaging: messaging.success ? messaging.data : DEFAULT_MESSAGING_CONFIG,
  };
}

export async function getCurrentPhase(now = new Date()): Promise<Phase> {
  const config = await getConfig();
  return currentPhase(now, config.phase);
}

export async function getPhaseAndSections(now = new Date()) {
  const config = await getConfig();
  const phase = currentPhase(now, config.phase);
  return { phase, sections: sectionOrder(phase), config };
}

/**
 * Validates against the key's schema, then upserts. Phase dates are
 * additionally checked for ordering: a configuration where detailsOpenAt is
 * after dayOfStartAt makes a phase unreachable, which is never intended.
 */
export async function setConfigValue(
  key: ConfigKey,
  value: unknown,
  db: DbLike = getDb(),
): Promise<Result<AppConfig>> {
  const parsed = CONFIG_SCHEMAS[key].safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return serviceError(
      'validation',
      first ? `${first.path.join('.') || key}: ${first.message}` : `Invalid value for ${key}.`,
      first?.path.join('.') ?? key,
    );
  }

  if (key === 'phase') {
    const ordering = validatePhaseOrdering(parsed.data as AppConfig['phase']);
    if (!ordering.ok) return serviceError('validation', ordering.message, 'phase');
  }

  await db
    .insert(siteConfig)
    .values({ key, value: parsed.data })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value: parsed.data } });

  return ok(await getConfig(db));
}
