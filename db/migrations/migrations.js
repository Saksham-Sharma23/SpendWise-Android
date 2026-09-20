// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_greedy_phalanx.sql';
import m0001 from './0001_rebuild_defaults_partial_indexes.sql';
import m0002 from './0002_add_uid_kind.sql';
import m0003 from './0003_backfill_uid_kind_timestamps.sql';
import m0004 from './0004_uid_not_null_drop_recurring.sql';
import m0005 from './0005_add_month_column.sql';
import m0006 from './0006_category_name_unique.sql';
import m0007 from './0007_groups.sql';
import m0008 from './0008_seed_self_person.sql';
import m0009 from './0009_analytics_covering_indexes.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009
    }
  }
  