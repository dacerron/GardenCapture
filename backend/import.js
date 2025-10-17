// Usage: node import.js path/to/data.json
const fs = require('fs');
const Database = require('better-sqlite3');

const jsonPath = process.argv[2] || 'data.json';
const items = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const db = new Database('app.db');
db.exec(fs.readFileSync('schema.sql', 'utf-8'));

// upserts
const upsertField = db.prepare(`
INSERT INTO fields (
  field_id, name, description, file, thumbnail, thumbnail_alt, location_name,
  latitude, longitude, audio, default_matrix_json, default_animation_json
) VALUES (
  @FieldID, @Name, @Description, @File, @Thumbnail, @ThumbnailAlt, @LocationName,
  @Latitude, @Longitude, @Audio, @DefaultMatrixJson, @DefaultAnimationJson
)
ON CONFLICT(field_id) DO UPDATE SET
  name=excluded.name,
  description=excluded.description,
  file=excluded.file,
  thumbnail=excluded.thumbnail,
  thumbnail_alt=excluded.thumbnail_alt,
  location_name=excluded.location_name,
  latitude=excluded.latitude,
  longitude=excluded.longitude,
  audio=excluded.audio,
  default_matrix_json=excluded.default_matrix_json,
  default_animation_json=excluded.default_animation_json
RETURNING id
`);

const upsertSoil = db.prepare(`
INSERT INTO soil_properties (field_fk, "order", "group", subgroup, series)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(field_fk) DO UPDATE SET
  "order"=excluded."order",
  "group"=excluded."group",
  subgroup=excluded.subgroup,
  series=excluded.series
RETURNING id
`);

const deleteHorizons = db.prepare(`DELETE FROM soil_horizons WHERE soil_fk = ?`);
const insertHorizon = db.prepare(`
INSERT INTO soil_horizons (soil_fk, idx, horizon)
VALUES (?, ?, ?)
ON CONFLICT(soil_fk, idx) DO UPDATE SET horizon=excluded.horizon
`);

const upsertMeta = db.prepare(`
INSERT INTO metadata (
  field_fk, captured_by, capture_date, capture_device, capture_format,
  colour_correction, processed_by, frames_in, frames_tracked,
  software_editor, software_tracker, model_type
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(field_fk) DO UPDATE SET
  captured_by=excluded.captured_by,
  capture_date=excluded.capture_date,
  capture_device=excluded.capture_device,
  capture_format=excluded.capture_format,
  colour_correction=excluded.colour_correction,
  processed_by=excluded.processed_by,
  frames_in=excluded.frames_in,
  frames_tracked=excluded.frames_tracked,
  software_editor=excluded.software_editor,
  software_tracker=excluded.software_tracker,
  model_type=excluded.model_type
`);

const tx = db.transaction((rows) => {
  for (const it of rows) {
    const DefaultMatrixJson = JSON.stringify(it.DefaultMatrix ?? []);
    const DefaultAnimationJson = JSON.stringify(it.DefaultAnimation ?? []);

    const fieldRow = upsertField.get({
      FieldID: it.FieldID,
      Name: it.Name ?? null,
      Description: it.Description ?? null,
      File: it.File ?? null,
      Thumbnail: it.Thumbnail ?? null,
      ThumbnailAlt: it.ThumbnailAlt ?? null,
      LocationName: it.LocationName ?? null,
      Latitude: it.Latitude ?? null,
      Longitude: it.Longitude ?? null,
      Audio: it.Audio ?? null,
      DefaultMatrixJson,
      DefaultAnimationJson
    });

    // Soil
    const sp = it.SoilProperties ?? {};
    const soilRow = upsertSoil.get(
      fieldRow.id,
      sp.Order ?? null,
      sp.Group ?? null,
      sp.SubGroup ?? null,
      sp.Series ?? null
    );

    // Horizons list
    const horizons = Array.isArray(sp.Horizons) ? sp.Horizons : [];
    deleteHorizons.run(soilRow.id);
    horizons.forEach((h, idx) => insertHorizon.run(soilRow.id, idx, h ?? null));

    // Metadata
    const m = it.Metadata ?? {};
    upsertMeta.run(
      fieldRow.id,
      m.CapturedBy ?? null,
      m.CaptureDate ?? null,
      m.CaptureDevice ?? null,
      m.CaptureFormat ?? null,
      m.ColourCorrection ?? null,
      m.ProcessedBy ?? null,
      Number.isFinite(m.FramesIn) ? m.FramesIn : null,
      Number.isFinite(m.FramesTracked) ? m.FramesTracked : null,
      m.SoftwareEditor ?? null,
      m.SoftwareTracker ?? null,
      m.ModelType ?? null
    );
  }
});

tx(items);
console.log(`Imported ${items.length} records.`);