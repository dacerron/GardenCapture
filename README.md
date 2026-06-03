# Virtual Soils

Web app for exploring 3D Gaussian splat reconstructions of soil and landscape sites (map, viewer, editor, admin).

## Local development

```bash
npm install
cp .env.example .env   # fill from HCP Terraform outputs
npm run dev
```

### Required environment variables

Set in `.env` (local) or CI build env (CloudFront deploy). See `.env.example`.

| Variable | Source (HCP output) |
|----------|---------------------|
| `VITE_API_URL` | `api_endpoint` |
| `VITE_COGNITO_USER_POOL_ID` | `cognito_user_pool_id` |
| `VITE_COGNITO_CLIENT_ID` | `cognito_user_pool_client_id` |
| `VITE_COGNITO_OAUTH_DOMAIN` | `cognito_hosted_ui_domain` |

Infrastructure is managed in the lab Terraform repo (`projects/ubc-eml/virtual-soils/`). See `terraform/README.md`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
