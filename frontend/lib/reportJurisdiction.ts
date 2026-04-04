import { buildJurisdictionCode } from '@/lib/indiaLocation';

/**
 * Jurisdiction sent with POST /report/submit. Authorities only see cases where this
 * equals their registered jurisdiction_code.
 *
 * Set NEXT_PUBLIC_REPORT_JURISDICTION_OVERRIDE (e.g. MOCK-JURISDICTION) on demo stacks
 * where the portal uses a seeded mock authority instead of per-state keys.
 */
export function getReportJurisdictionCode(stateCode: string, cityOrDistrict: string): string {
  const override =
    typeof process.env.NEXT_PUBLIC_REPORT_JURISDICTION_OVERRIDE === 'string'
      ? process.env.NEXT_PUBLIC_REPORT_JURISDICTION_OVERRIDE.trim()
      : '';
  if (override) return override;
  if (!stateCode || !cityOrDistrict.trim()) return '';
  return buildJurisdictionCode(stateCode, cityOrDistrict);
}

export function isReportJurisdictionOverrideActive(): boolean {
  const o = process.env.NEXT_PUBLIC_REPORT_JURISDICTION_OVERRIDE;
  return typeof o === 'string' && o.trim().length > 0;
}
