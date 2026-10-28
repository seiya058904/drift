PRAGMA foreign_keys = ON;
CREATE TABLE sessions (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE bottles (
  id TEXT PRIMARY KEY, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden','flagged')),
  exposure_count INTEGER NOT NULL DEFAULT 0, report_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, moderation_reason TEXT
);
CREATE INDEX bottles_pool ON bottles(status, id, exposure_count);
CREATE TABLE submissions (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL, bottle_id TEXT NOT NULL REFERENCES bottles(id), body_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(session_id, request_key)
);
CREATE INDEX submissions_exclude ON submissions(session_id, bottle_id, created_at);
CREATE TABLE draws (
  token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL, bottle_id TEXT NOT NULL REFERENCES bottles(id), expires_at INTEGER NOT NULL,
  consumed_at INTEGER, UNIQUE(session_id, request_key)
);
CREATE INDEX draws_expiry ON draws(expires_at);
CREATE TABLE opens (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  bottle_id TEXT NOT NULL REFERENCES bottles(id), opened_at INTEGER NOT NULL,
  PRIMARY KEY(session_id, bottle_id)
);
CREATE TABLE reports (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  bottle_id TEXT NOT NULL REFERENCES bottles(id), created_at INTEGER NOT NULL,
  PRIMARY KEY(session_id, bottle_id)
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
CREATE TRIGGER consume_draw AFTER UPDATE OF consumed_at ON draws
WHEN OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO opens(session_id, bottle_id, opened_at) VALUES(NEW.session_id, NEW.bottle_id, NEW.consumed_at);
END;
CREATE TRIGGER count_exposure AFTER INSERT ON opens
BEGIN UPDATE bottles SET exposure_count = exposure_count + 1 WHERE id = NEW.bottle_id; END;
CREATE TRIGGER count_report AFTER INSERT ON reports
BEGIN
  UPDATE bottles SET report_count = report_count + 1,
    status = CASE WHEN report_count + 1 >= 3 AND status = 'approved' THEN 'flagged' ELSE status END
    WHERE id = NEW.bottle_id;
END;
