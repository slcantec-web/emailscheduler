CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sender_name TEXT,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DISABLED')),
  schedule_limit INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS otp_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('REGISTRATION','PASSWORD_RESET','EMAIL_VERIFICATION')),
  expires_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER,
  ticket_hash TEXT,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_requests(email, purpose);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  birthday TEXT,
  anniversary TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, email)
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('ONE_TIME','DAILY','WEEKLY','MONTHLY','YEARLY','BIRTHDAY','ANNIVERSARY')),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject_template TEXT NOT NULL DEFAULT '',
  message_template TEXT NOT NULL,
  sender_name TEXT,
  scheduled_at INTEGER,
  next_run_at INTEGER,
  recurrence_rule TEXT,
  send_time TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','PROCESSING','SENT','FAILED','CANCELLED')),
  claimed_at INTEGER,
  last_run_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_messages(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_sched_user ON scheduled_messages(user_id);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  campaign_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  sender_name TEXT,
  scheduled_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','RUNNING','COMPLETED','CANCELLED')),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  repeat_type TEXT,
  repeat_rule TEXT,
  repeat_time TEXT
);
CREATE INDEX IF NOT EXISTS idx_camp_due ON email_campaigns(status, scheduled_at);

CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
  provider_message_id TEXT,
  sent_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_camprec ON email_campaign_recipients(campaign_id, status);

CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  message_type TEXT NOT NULL,
  message_reference TEXT,
  subject_preview TEXT,
  message_preview TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON email_logs(user_id, created_at);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  subject_body TEXT NOT NULL DEFAULT '',
  message_body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Sri Lanka holidays (admin-managed: manual, JSON import, or sync from open data)
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date TEXT NOT NULL,
  name TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,
  is_bank INTEGER NOT NULL DEFAULT 0,
  is_mercantile INTEGER NOT NULL DEFAULT 0,
  is_poya INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (holiday_date, name)
);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_holidays_year ON holidays(holiday_date);

INSERT OR IGNORE INTO system_settings (setting_key, setting_value, updated_at) VALUES
 ('max_user_scheduled_messages','5',strftime('%s','now')),
 ('max_daily_emails','30',strftime('%s','now')),
 ('max_monthly_emails','500',strftime('%s','now')),
 ('max_contacts','100',strftime('%s','now')),
 ('max_bulk_recipients','500',strftime('%s','now')),
 ('max_otp_requests','5',strftime('%s','now')),
 ('max_login_attempts','8',strftime('%s','now')),
 ('otp_expiry_minutes','10',strftime('%s','now')),
 ('max_otp_attempts','5',strftime('%s','now')),
 ('allow_custom_sender_name','1',strftime('%s','now')),
 ('registration_enabled','1',strftime('%s','now')),
 ('bulk_batch_size','20',strftime('%s','now'));

-- Existing D1 databases: run the holidays CREATE TABLE + indexes above once in the Console.
