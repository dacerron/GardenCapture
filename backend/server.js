const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const db = new Database('app.db');

app.use(express.json());
app.use(express.static('public')); // serves /admin.html

// ----- existing read routes -----

app.get('/pins', (req, res) => {
    const rows = db.prepare(`
      SELECT
        name        AS title,
        latitude    AS lat,
        longitude   AS lng,
        file        AS path
      FROM fields
      WHERE id IN (8, 9, 10)
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL
      ORDER BY name
    `).all();
  
    // shape for frontend
    const pins = rows.map(r => ({
      title: r.title ?? '',
      position: { lat: r.lat, lng: r.lng },
      path: r.path ?? ''
    }));
  
    res.json(pins);
  });

app.get('/fields', (req, res) => {
  const rows = db.prepare(`SELECT * FROM fields ORDER BY field_id`).all();
  res.json(rows);
});

app.get('/fields/:fieldId', (req, res) => {
  const f = db.prepare(`SELECT * FROM fields WHERE field_id = ?`).get(req.params.fieldId);
  if (!f) return res.status(404).json({ error: 'Not found' });

  const soil = db.prepare(`SELECT id, "order", "group", subgroup, series FROM soil_properties WHERE field_fk = ?`).get(f.id);
  const horizons = soil
    ? db.prepare(`SELECT idx, horizon FROM soil_horizons WHERE soil_fk = ? ORDER BY idx`).all(soil.id)
    : [];
  const meta = db.prepare(`SELECT captured_by, capture_date, capture_device, capture_format, colour_correction, processed_by,
                                  frames_in, frames_tracked, software_editor, software_tracker, model_type
                           FROM metadata WHERE field_fk = ?`).get(f.id);

  res.json({
    FieldID: f.field_id,
    Name: f.name,
    Description: f.description,
    File: f.file,
    Thumbnail: f.thumbnail,
    ThumbnailAlt: f.thumbnail_alt,
    LocationName: f.location_name,
    Latitude: f.latitude,
    Longitude: f.longitude,
    SoilProperties: soil ? {
      Order: soil.order, Group: soil.group, SubGroup: soil.subgroup, Series: soil.series,
      Horizons: horizons.map(h => h.horizon)
    } : null,
    Metadata: meta || null,
    Audio: f.audio,
    DefaultMatrix: JSON.parse(f.default_matrix_json || '[]'),
    DefaultAnimation: JSON.parse(f.default_animation_json || '[]')
  });
});

// ----- admin write routes -----
const upsertField = db.prepare(`
INSERT INTO fields (
  field_id, name, description, file, thumbnail, thumbnail_alt, location_name,
  latitude, longitude, audio, default_matrix_json, default_animation_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(field_id) DO UPDATE SET
  name=excluded.name, description=excluded.description, file=excluded.file,
  thumbnail=excluded.thumbnail, thumbnail_alt=excluded.thumbnail_alt,
  location_name=excluded.location_name, latitude=excluded.latitude, longitude=excluded.longitude,
  audio=excluded.audio, default_matrix_json=excluded.default_matrix_json,
  default_animation_json=excluded.default_animation_json
RETURNING id
`);

const upsertSoil = db.prepare(`
INSERT INTO soil_properties (field_fk, "order", "group", subgroup, series)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(field_fk) DO UPDATE SET "order"=excluded."order", "group"=excluded."group",
  subgroup=excluded.subgroup, series=excluded.series
RETURNING id
`);

const delHorizons = db.prepare(`DELETE FROM soil_horizons WHERE soil_fk = ?`);
const insHorizon  = db.prepare(`INSERT INTO soil_horizons (soil_fk, idx, horizon)
                                VALUES (?, ?, ?)
                                ON CONFLICT(soil_fk, idx) DO UPDATE SET horizon=excluded.horizon`);

const upsertMeta = db.prepare(`
INSERT INTO metadata (field_fk, captured_by, capture_date, capture_device, capture_format,
  colour_correction, processed_by, frames_in, frames_tracked, software_editor, software_tracker, model_type)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(field_fk) DO UPDATE SET
  captured_by=excluded.captured_by, capture_date=excluded.capture_date, capture_device=excluded.capture_device,
  capture_format=excluded.capture_format, colour_correction=excluded.colour_correction, processed_by=excluded.processed_by,
  frames_in=excluded.frames_in, frames_tracked=excluded.frames_tracked, software_editor=excluded.software_editor,
  software_tracker=excluded.software_tracker, model_type=excluded.model_type
`);

app.post('/admin/fields', (req, res) => {
  const it = req.body || {};
  if (!it.FieldID) return res.status(400).send('FieldID is required');

  const DefaultMatrixJson = JSON.stringify(it.DefaultMatrix ?? []);
  const DefaultAnimationJson = JSON.stringify(it.DefaultAnimation ?? []);

  const tx = db.transaction(() => {
    const f = upsertField.get(
      it.FieldID, it.Name ?? null, it.Description ?? null, it.File ?? null, it.Thumbnail ?? null,
      it.ThumbnailAlt ?? null, it.LocationName ?? null, it.Latitude ?? null, it.Longitude ?? null,
      it.Audio ?? null, DefaultMatrixJson, DefaultAnimationJson
    );

    const sp = it.SoilProperties ?? {};
    const soil = upsertSoil.get(
      f.id, sp.Order ?? null, sp.Group ?? null, sp.SubGroup ?? null, sp.Series ?? null
    );

    const horizons = Array.isArray(sp.Horizons) ? sp.Horizons : [];
    delHorizons.run(soil.id);
    horizons.forEach((h, idx) => insHorizon.run(soil.id, idx, h ?? null));

    const m = it.Metadata ?? {};
    upsertMeta.run(
      f.id, m.CapturedBy ?? null, m.CaptureDate ?? null, m.CaptureDevice ?? null, m.CaptureFormat ?? null,
      m.ColourCorrection ?? null, m.ProcessedBy ?? null, Number.isFinite(m.FramesIn) ? m.FramesIn : null,
      Number.isFinite(m.FramesTracked) ? m.FramesTracked : null, m.SoftwareEditor ?? null,
      m.SoftwareTracker ?? null, m.ModelType ?? null
    );
  });

  try { tx(); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).send('Failed to save'); }
});

app.delete('/admin/fields/:fieldId', (req, res) => {
  const f = db.prepare('SELECT id FROM fields WHERE field_id = ?').get(req.params.fieldId);
  if (!f) return res.status(404).send('Not found');
  db.prepare('DELETE FROM fields WHERE id = ?').run(f.id); // cascades to soil/meta/horizons
  res.json({ ok: true });
});

app.listen(3000, () => console.log('Admin at http://localhost:3000/admin.html'));
