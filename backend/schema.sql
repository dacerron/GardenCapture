PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id TEXT UNIQUE NOT NULL,
  name TEXT,
  description TEXT,
  file TEXT,
  thumbnail TEXT,
  thumbnail_alt TEXT,
  location_name TEXT,
  latitude REAL,
  longitude REAL,
  audio TEXT,
  default_matrix_json TEXT,     -- store arrays as JSON for now
  default_animation_json TEXT   -- same here
);

CREATE TABLE IF NOT EXISTS soil_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_fk INTEGER NOT NULL UNIQUE,
  "order" TEXT,
  "group" TEXT,
  subgroup TEXT,
  series TEXT,
  FOREIGN KEY(field_fk) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS soil_horizons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  soil_fk INTEGER NOT NULL,
  idx INTEGER NOT NULL,          -- preserve order
  horizon TEXT,
  UNIQUE(soil_fk, idx),
  FOREIGN KEY(soil_fk) REFERENCES soil_properties(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_fk INTEGER NOT NULL UNIQUE,
  captured_by TEXT,
  capture_date TEXT,             -- keep original string; cast later if needed
  capture_device TEXT,
  capture_format TEXT,
  colour_correction TEXT,
  processed_by TEXT,
  frames_in INTEGER,
  frames_tracked INTEGER,
  software_editor TEXT,
  software_tracker TEXT,
  model_type TEXT,
  FOREIGN KEY(field_fk) REFERENCES fields(id) ON DELETE CASCADE
);
