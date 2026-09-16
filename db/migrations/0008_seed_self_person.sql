-- Custom migration (drizzle-kit generate --custom): the one `people` row that is YOU.
-- Every group includes it and every balance is shown from its point of view, so it must exist
-- before any Groups code runs — hence a migration rather than the versioned seed. The fixed uid
-- keeps it the same row across a JSON export → restore, and OR IGNORE makes a re-run harmless.
INSERT OR IGNORE INTO `people` (`uid`, `name`, `is_self`) VALUES ('sys:self', 'You', 1);
