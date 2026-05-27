-- HVP Quoting App Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS employees (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  contact    TEXT,
  email      TEXT,
  phone      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1001;

CREATE TABLE IF NOT EXISTS quotes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number   TEXT UNIQUE NOT NULL DEFAULT ('HVP-' || nextval('quote_number_seq')),
  customer_id    UUID REFERENCES customers(id),
  employee_id    UUID REFERENCES employees(id),
  status         TEXT NOT NULL DEFAULT 'draft',
  items          JSONB NOT NULL DEFAULT '[]',
  internal_notes TEXT,
  customer_notes TEXT,
  markup         NUMERIC(4,2) DEFAULT 1.90,
  expires_at     TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  emailed_at     TIMESTAMPTZ,
  converted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artwork (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id    UUID REFERENCES quotes(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  data_b64    TEXT NOT NULL,
  size_bytes  INTEGER,
  uploaded_by UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_log (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id  UUID REFERENCES quotes(id),
  sent_by   UUID REFERENCES employees(id),
  recipient TEXT NOT NULL,
  subject   TEXT,
  sent_at   TIMESTAMPTZ DEFAULT NOW(),
  success   BOOLEAN DEFAULT true,
  error_msg TEXT
);

CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_employee ON quotes(employee_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status   ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_expires  ON quotes(expires_at);
CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(name);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
