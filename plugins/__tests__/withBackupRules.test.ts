/* eslint-disable @typescript-eslint/no-require-imports */
const plugin = require('../withBackupRules') as {
  EXCLUDES: [string, string][];
  fullBackupContentXml: () => string;
  dataExtractionRulesXml: () => string;
};

/**
 * Auto-backup rules must stay EXCLUDE-ONLY: a single <include> makes Android
 * back up only the included paths, and the database would silently drop out
 * of every backup. Verified against a real prebuild manifest on 2026-09-14.
 */
describe('withBackupRules', () => {
  const xmls = [plugin.fullBackupContentXml(), plugin.dataExtractionRulesXml()];

  it('never contains an <include>', () => {
    for (const xml of xmls) expect(xml).not.toMatch(/<include/);
  });

  it('excludes the WAL side files and every device-local copy — but not the database', () => {
    for (const xml of xmls) {
      expect(xml).toContain('path="SQLite/spendwise.db-wal"');
      expect(xml).toContain('path="SQLite/spendwise.db-shm"');
      expect(xml).toContain('path="snapshots/"');
      // Phase 7: whole copies of the database. Backing them up would multiply
      // every auto-backup by the number of exports kept, into the 25 MB cap.
      expect(xml).toContain('path="backups/"');
      expect(xml).toContain('path="SQLite/restore-staging.db"');
      expect(xml).toContain('path="unreadable/"');
      // R6: the crash log describes the install that crashed. Carrying it to a
      // restored install would attribute old crashes to a new phone, and it
      // competes with the database for the 25 MB quota.
      expect(xml).toContain('path="logs/"');
      expect(xml).not.toContain('path="SQLite/spendwise.db"');
      expect(xml).not.toContain('path="SQLite/"');
      expect(xml).not.toContain('sheets');
    }
  });

  it('applies the same rules to cloud backup and device transfer', () => {
    const xml = plugin.dataExtractionRulesXml();
    const cloud = xml.slice(xml.indexOf('<cloud-backup>'), xml.indexOf('</cloud-backup>'));
    const transfer = xml.slice(xml.indexOf('<device-transfer>'), xml.indexOf('</device-transfer>'));
    expect(cloud.replace('<cloud-backup>', '').trim()).toBe(transfer.replace('<device-transfer>', '').trim());
  });
});
