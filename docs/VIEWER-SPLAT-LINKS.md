# Production viewer links (splats)

Template for documenting public PlayCanvas viewer URLs after coFood hosting is provisioned. Use for smoke tests, LMS embeds, and sharing.

**Warning:** This fork does not ship baked-in CloudFront or API hostnames. Set the variables below from your Terraform / hosting outputs before building this list. Running tools against unset URLs will fail.

---

## Domains (required)

Export these (or substitute manually) before generating links:

| Role | Env var | Example placeholder |
|------|---------|---------------------|
| Viewer | `VIEWER_SITE_URL` | `https://YOUR_VIEWER_CLOUDFRONT_DOMAIN` |
| Assets (splats / LOD) | `ASSETS_CDN_URL` | `https://YOUR_ASSETS_CLOUDFRONT_DOMAIN` |
| API | `VITE_PUBLIC_API_URL` | `https://YOUR_API_ID.execute-api.ca-central-1.amazonaws.com` |

```bash
: "${VIEWER_SITE_URL:?error: set VIEWER_SITE_URL (viewer CloudFront HTTPS origin)}"
: "${ASSETS_CDN_URL:?error: set ASSETS_CDN_URL (assets CloudFront HTTPS origin)}"
: "${VITE_PUBLIC_API_URL:?error: set VITE_PUBLIC_API_URL (API Gateway base URL)}"
```

## URL pattern

```text
{VIEWER_SITE_URL}/viewer/?m={FieldID}
```

- `FieldID` comes from DynamoDB / `GET /fields` (not the splat file basename).
- `/?m={FieldID}` on the viewer root redirects to `/viewer/?m=…`.
- Disable ground height clamp on noisy scenes: append `&groundClamp=0`.
- LOD manifest URLs follow: `{ASSETS_CDN_URL}/splats/lod/{basename}/lod-meta.json`.

---

## Fields and viewer links

Populate after your coFood API and viewer are live:

| Field ID | Name | Splat bundle (LOD) | Viewer |
|----------|------|--------------------|--------|
| *(from GET /fields)* | | | `{VIEWER_SITE_URL}/viewer/?m={FieldID}` |

---

## Refresh this list

After adding fields in admin or changing CloudFront domains, re-fetch from the API:

```bash
: "${VIEWER_SITE_URL:?error: set VIEWER_SITE_URL}"
: "${VITE_PUBLIC_API_URL:?error: set VITE_PUBLIC_API_URL}"
node -e "const a=process.env.VITE_PUBLIC_API_URL.replace(/\\/\$/,''),v=process.env.VIEWER_SITE_URL.replace(/\\/\$/,'');fetch(a+'/fields').then(r=>r.json()).then(raw=>{(Array.isArray(raw)?raw:raw.items||[]).sort((x,y)=>String(x.FieldID).localeCompare(String(y.FieldID))).forEach(f=>console.log(f.FieldID,'|',f.Name,'|',v+'/viewer/?m='+encodeURIComponent(f.FieldID)));})"
```

Or run `npm run verify:fileplaycanvas` to confirm which fields have PlayCanvas LOD configured (API URL must be set in `.env`).

**Related:** [`DECOUPLED-APPS.md`](./DECOUPLED-APPS.md) (URL stability), [`DEPLOY-S3-CLOUDFRONT.md`](./DEPLOY-S3-CLOUDFRONT.md) (deploy / smoke test).
