# Production viewer links (splats)

Reference URLs for the public PlayCanvas viewer on CloudFront. Use these for smoke tests, LMS embeds, and sharing.

**Last updated:** 2026-06-25 (from `GET /fields` on production API)

---

## Domains

| Role | Domain |
|------|--------|
| Viewer (this doc) | `d2npz8tam2i8fl.cloudfront.net` |
| Assets (splats / LOD) | `d3sni13yu1e7cb.cloudfront.net` |
| API | `5yfm4yfcq6.execute-api.ca-central-1.amazonaws.com` |

## URL pattern

```text
https://d2npz8tam2i8fl.cloudfront.net/viewer/?m={FieldID}
```

- `FieldID` comes from DynamoDB / `GET /fields` (not the splat file basename).
- `/?m={FieldID}` on the viewer root redirects to `/viewer/?m=…`.
- Disable ground height clamp on noisy scenes: append `&groundClamp=0`.

---

## Fields and viewer links

| Field ID | Name | Splat bundle (LOD) | Viewer |
|----------|------|--------------------|--------|
| **AW_3** | UBC Totem Field | `UBC_TotemField` | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=AW_3 |
| **AW1** | UBC Farm Agricultural Fields | `UBC_Farm_Agricultural` | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=AW1 |
| **AW2** | UBC Farm Agricultural Fields 2 | `UBC_Farm_Agricultural` | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=AW2 |
| **StsAiles_001** | Sts'Ailes Territory \| Philips Arm Forest Garden | `PhilipsForestGarden_HighQuality_3SH` | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=StsAiles_001 |
| **UM_01** | Badger | `UM_ResearchStation_01_WebHigh` | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=UM_01 |
| **UM_05** | University of Manitoba \| Weather Station | `UM05_HighQuality_0SH` | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=UM_05 |
| **UM02** | University Manitoba Embankment | `UM02` | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=UM02 |

**Notes**

- **AW1** and **AW2** share the same splat bundle but are separate fields (different markers / start positions).
- LOD manifest URLs follow: `https://d3sni13yu1e7cb.cloudfront.net/splats/lod/{basename}/lod-meta.json`.

---

## Ground clamp disabled (`groundClamp=0`)

Use when the heightmap is noisy or the camera feels stuck too high:

| Field ID | Link |
|----------|------|
| AW_3 | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=AW_3&groundClamp=0 |
| AW1 | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=AW1&groundClamp=0 |
| AW2 | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=AW2&groundClamp=0 |
| StsAiles_001 | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=StsAiles_001&groundClamp=0 |
| UM_01 | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=UM_01&groundClamp=0 |
| UM_05 | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=UM_05&groundClamp=0 |
| UM02 | https://d2npz8tam2i8fl.cloudfront.net/viewer/?m=UM02&groundClamp=0 |

---

## Refresh this list

After adding fields in admin or changing CloudFront domains, re-fetch from the API:

```bash
node -e "fetch('https://5yfm4yfcq6.execute-api.ca-central-1.amazonaws.com/fields').then(r=>r.json()).then(raw=>{const v='https://d2npz8tam2i8fl.cloudfront.net';(Array.isArray(raw)?raw:raw.items||[]).sort((a,b)=>String(a.FieldID).localeCompare(String(b.FieldID))).forEach(f=>console.log(f.FieldID,'|',f.Name,'|',v+'/viewer/?m='+encodeURIComponent(f.FieldID)));})"
```

Or run `npm run verify:fileplaycanvas` to confirm which fields have PlayCanvas LOD configured.

**Related:** [`DECOUPLED-APPS.md`](./DECOUPLED-APPS.md) (URL stability), [`DEPLOY-S3-CLOUDFRONT.md`](./DEPLOY-S3-CLOUDFRONT.md) (deploy / smoke test).
