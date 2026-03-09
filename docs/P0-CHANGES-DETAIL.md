# P0 Changes – What’s Involved

Concrete changes for each P0 item: files to touch, what to add/remove, and how it fits together.

---

## P0.1 – Fix Viewer type guard and align naming

**Problem**  
In `src/Viewer.tsx`, the type guard is misleading:

- **Function name**: `hasSetGaussianPath` → suggests the object has `setGaussianPath`.
- **Comment**: “narrows to objects that have setGaussianPath”.
- **Implementation**: checks for `"loadGaussianScene" in o` and the type says `setGaussianPath`.

`ThreeApp` actually exposes `loadGaussianScene(path: string)`, not `setGaussianPath`. So the name and type are wrong; only the runtime check is correct.

**Changes**

| File | Change |
|------|--------|
| `src/Viewer.tsx` | 1. Rename `hasSetGaussianPath` → `hasLoadGaussianScene`. 2. Fix the return type to `o is { loadGaussianScene: (path: string) => void \| Promise<void> }`. 3. Update the comment to say “narrows to objects that have loadGaussianScene”. |

**Code (before → after)**

```ts
// Before
// narrows to objects that have setGaussianPath
function hasSetGaussianPath(
  o: unknown
): o is { setGaussianPath: (path: string) => void | Promise<void> } {
  return !!o && typeof o === "object" && "loadGaussianScene" in o;
}
// ... later: if (raw && hasSetGaussianPath(app)) { app.loadGaussianScene(resolved); }

// After
// Narrows to objects that have loadGaussianScene (e.g. ThreeApp)
function hasLoadGaussianScene(
  o: unknown
): o is { loadGaussianScene: (path: string) => void | Promise<void> } {
  return !!o && typeof o === "object" && "loadGaussianScene" in o;
}
// ... later: if (raw && hasLoadGaussianScene(app)) { app.loadGaussianScene(resolved); }
```

**Scope**  
One function rename + type + comment + one call site. No other files need to change.

---

## P0.2 – Remove or secure hardcoded secrets and env assumptions

**Problem**

1. **auth.ts** – Cognito user pool ID, client ID, OAuth domain, and redirect URLs are hardcoded. That forces one environment (e.g. localhost) and makes production/staging awkward.
2. **Admin.tsx** – Logout builds the Cognito logout URL with hardcoded `domain`, `clientId`, and `logoutUri` (e.g. `http://localhost:5173/`). Same environment lock-in.
3. **awsClient.ts** – Uses `VITE_AWS_ACCESS_KEY_ID` and `VITE_AWS_SECRET_ACCESS_KEY` in the browser. Long-lived IAM keys in the frontend are a security risk (they can be extracted from the bundle or network).

**Changes**

### 2a. Move Cognito and redirects to env (auth + Admin)

| File | Change |
|------|--------|
| **New/updated** | Add to `.env.example` (and document in README): `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_OAUTH_DOMAIN`, `VITE_APP_ORIGIN` (e.g. `http://localhost:5173` or production URL). |
| `src/auth.ts` | Replace hardcoded values with `import.meta.env.VITE_COGNITO_*` and `VITE_APP_ORIGIN`. Use `VITE_APP_ORIGIN` to build redirectSignIn and redirectSignOut (e.g. `${VITE_APP_ORIGIN}/admin`, `${VITE_APP_ORIGIN}/`). |
| `src/Admin.tsx` | In `onLogout`, build the logout URL from the same env vars (e.g. `VITE_COGNITO_OAUTH_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_APP_ORIGIN` for logout_uri). |

**Example auth.ts (concept)**

```ts
const origin = import.meta.env.VITE_APP_ORIGIN || (typeof window !== "undefined" ? window.location.origin : "");
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_OAUTH_DOMAIN,
          scopes: ["openid", "email"],
          redirectSignIn: [`${origin}/admin`],
          redirectSignOut: [`${origin}/`],
          responseType: "code",
        },
      },
    },
  },
});
```

**Example Admin logout (concept)**

```ts
const domain = import.meta.env.VITE_COGNITO_OAUTH_DOMAIN;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const logoutUri = import.meta.env.VITE_APP_ORIGIN || window.location.origin;
window.location.assign(
  `https://${domain}/logout?client_id=${encodeURIComponent(clientId)}&logout_uri=${encodeURIComponent(logoutUri)}`
);
```

**Scope**  
2–3 env vars, `auth.ts` and `Admin.tsx` only. No change to how auth works, only where config comes from.

### 2b. AWS keys in the frontend (awsClient.ts)

**Options (choose one and document):**

- **Option A – Document and accept risk (minimal change)**  
  Add a short comment in `awsClient.ts` and in the docs: “Frontend uses IAM keys for signing; do not use for production with sensitive data. Prefer a backend proxy or Cognito Identity Pool.” No code change beyond comments/docs.

- **Option B – Backend proxy (recommended for production)**  
  Add a small backend route (e.g. Next API route, or existing backend) that the frontend calls instead of signing itself. That route uses IAM credentials on the server to call the real API (e.g. Lambda/API Gateway) and returns the response. Frontend then calls `fetch('/api/pins')` (or similar) with no AWS keys. Changes: new backend endpoint, frontend uses that URL instead of `awsClient` for `/pins` (and any other signed calls).

- **Option C – Cognito Identity Pool**  
  Use Amplify Auth to obtain temporary AWS credentials (Identity Pool) and sign with those instead of long-lived keys. Reduces exposure but still runs signing in the browser; requires Identity Pool setup and switching `awsClient` to use Amplify’s credential provider.

**Why use a backend proxy? Benefits and caveats**

- **Frontend signs and calls the API directly (current approach)**  
  The IAM key (and secret) must exist in the frontend env or build. Anyone who obtains that key (e.g. from a leaked .env or by inspecting a dev build) can sign requests from any app or script and call your API with the same power as your app. There is no single place to enforce “only my app” or “only logged-in users”—the only “auth” is the shared key.

- **Frontend calls your backend route; backend uses IAM and calls the API**  
  IAM credentials stay on the server. They are never sent to the browser or embedded in the app, so they cannot be stolen by inspecting the app or its network traffic.  
  If the proxy route is **unauthenticated**, then any other app (or curl/Postman) can call that route and get the same data. So in that case you have not restricted *who* can get the data—you have only moved *where* the keys live.  
  The benefits are: **(1)** Key exposure is removed from the client; stealing the key would require compromising your server, which is a smaller and more controlled risk. **(2)** The proxy is the place where you *can* add auth. Once you have a backend route, you can require a session cookie, Cognito token, or API key before calling the API. Then “another app” that simply hits `/api/pins` with no auth gets 401. So the benefit of the backend is not that it is secret by default, but that it gives you a place to enforce “only my app” or “only logged-in users” if you want. With direct client-side signing, you do not have that hook without something like Cognito Identity Pool and temporary credentials.

**Minimal P0 change**  
Do **2a** (env for Cognito and logout). For **2b**, at least add **Option A** (documentation + comment in code); optionally plan Option B or C for a follow-up.

### Network architecture: current vs with backend proxy

**Current architecture (frontend signs requests)**

```
┌─────────────┐     SigV4 signed GET /pins      ┌─────────────────┐     invoke     ┌────────┐     read     ┌──────────┐
│   Browser   │ ──────────────────────────────► │  API Gateway    │ ─────────────► │ Lambda │ ──────────► │ DynamoDB │
│  (React)    │     (IAM keys in env/bundle)    │  (execute-api)  │                │        │             │eml_fields│
└─────────────┘                                 └─────────────────┘                └────────┘             └──────────┘
       │
       │  Admin: Bearer token (Cognito)
       └──────────────────────────────────────► same API Gateway ──► Lambda (e.g. /admin/api/fields)

       │  Auth (Admin only)
       └──────────────────────────────────────► Cognito (OAuth, user pool)
```

- **Browser:** Runs the React app. Holds IAM credentials (via `VITE_AWS_*`), uses `aws4fetch` to sign requests to API Gateway. For Admin, sends Cognito access token in `Authorization` header.
- **API Gateway (execute-api):** AWS HTTP or REST API. Receives signed GET `/pins` and (on other routes) Bearer-authenticated admin requests. Forwards to Lambda. Public URL (e.g. `https://xxx.execute-api.<region>.amazonaws.com`).
- **Lambda:** Runs `lambda-handler.mjs`. Handles GET `/pins` (scan DynamoDB, return pin-shaped JSON) and likely GET/POST/PUT/DELETE for `/admin/api/fields`. No IAM keys in the function; it uses the execution role to access DynamoDB.
- **DynamoDB:** Table `eml_fields`. Stores field records (FieldID, Name, File, Latitude, Longitude, markers, etc.). Lambda reads/writes via the SDK.
- **Cognito:** User pool for Admin login (OAuth). Browser redirects to Cognito to sign in; Cognito returns tokens; browser sends token to API Gateway for admin routes. Not used for `/pins` today.

**Architecture with backend proxy (Option B)**

```
┌─────────────┐     GET /api/pins (no AWS keys)     ┌─────────────────┐     SigV4 signed GET /pins     ┌─────────────────┐     invoke    ┌────────┐     read    ┌──────────┐
│   Browser   │ ──────────────────────────────────► │  Proxy server   │ ─────────────────────────────► │  API Gateway    │ ────────────► │ Lambda │ ────────► │ DynamoDB │
│  (React)    │     same origin or your backend URL │  (your code)    │     (IAM keys on server only)   │  (execute-api)  │               │        │           │eml_fields│
└─────────────┘                                    └─────────────────┘                               └─────────────────┘               └────────┘           └──────────┘
       │                                                      │
       │  Admin: Bearer token                                 │  Optional: proxy can validate
       └─────────────────────────────────────────────────────┼── Cognito token before calling API
                                                             │
       │  Auth (Admin only)                                  │
       └──────────────────────────────────────► Cognito (unchanged)
```

- **Browser:** Only calls your own origin (or a dedicated backend URL). No IAM keys. For pins it does `fetch('/api/pins')` or `fetch('https://your-backend.example/api/pins')`. For Admin, still sends Cognito token to API Gateway (or you could route admin through the proxy too).
- **Proxy server:** New piece you add. Receives GET `/api/pins` (or equivalent). Uses IAM credentials stored only on the server (env or secret manager) to sign a request to API Gateway’s GET `/pins`, or to call Lambda directly (see below). Returns the response to the browser. Can add auth (e.g. require Cognito token or session cookie) before calling AWS. Can run as:
  - **Node/Express (or similar)** on a host you control (e.g. EC2, container, or a PaaS like Render/Fly.io).
  - **Serverless function** (e.g. a second Lambda that is not exposed to the internet; you expose it via API Gateway under a path that requires your own auth, or via another HTTP endpoint that only your frontend can call).
  - **Framework route** (e.g. Next.js API route, Remix loader) if you host the frontend with that framework; the route runs on the server and has access to env vars.
- **API Gateway:** Unchanged. Still receives the request that ultimately comes from the proxy (signed with the proxy’s IAM credentials). The browser never talks to API Gateway directly for `/pins`.
- **Lambda:** Unchanged. Still handles `/pins` and admin routes; no code change.
- **DynamoDB:** Unchanged.
- **Cognito:** Unchanged for Admin. Optionally the proxy can check a Cognito token before calling the API so only your app (or logged-in users) can get pins.

**Alternative: proxy calls Lambda directly**

You can skip API Gateway for the pins call: the proxy uses the AWS SDK to invoke the Lambda function directly (e.g. `Lambda.invoke` with the same event shape API Gateway would send). Then the proxy is the only public HTTP endpoint for pins; API Gateway can still be used for admin or other routes. Diagram:

```
Browser → Proxy (HTTP) → Lambda (SDK invoke) → DynamoDB
```

The proxy needs IAM permissions to invoke the Lambda; no API Gateway in the path for that call. This is useful if you want one “backend” URL and fewer moving parts for the pins flow.

**Services summary**

| Service        | Role now | Role with proxy |
|----------------|----------|------------------|
| **Browser**    | Runs React; holds IAM keys; signs and calls API Gateway for `/pins`. | Runs React; calls proxy only; no AWS keys. |
| **Proxy**      | — | Your code; holds IAM keys; calls API Gateway (or Lambda) and returns response; optional auth. |
| **API Gateway**| Receives signed `/pins` and Bearer admin routes; invokes Lambda. | Same; receives requests from proxy (and optionally still from browser for admin). |
| **Lambda**     | Handles `/pins` and admin; reads/writes DynamoDB. | Same. |
| **DynamoDB**   | Stores `eml_fields`. | Same. |
| **Cognito**    | Admin login only. | Same; optional use in proxy to gate `/api/pins`. |

**Where the proxy runs (concrete options)**

- **Same host as the frontend:** If you use a stack that serves both (e.g. Next.js: pages under `/`, API under `/api/pins`), the frontend uses relative URLs like `fetch('/api/pins')`. One deployment, one origin.
- **Separate backend URL:** Frontend uses `VITE_API_URL` or similar pointing to e.g. `https://api.yourdomain.com`. You deploy the proxy there (e.g. Express on a small instance, or a serverless function behind API Gateway or CloudFront). CORS must allow your frontend origin.
- **Existing backend:** If you already have a Node/Express (or similar) app that serves something else, add a `/api/pins` route that forwards to API Gateway or Lambda with IAM signing.

---

## P0.3 – Single source of truth for pin, field, and marker shape

**Problem**

- **Pin** is defined locally in `UBCMap.tsx` and again (as a similar shape) in `Editor.tsx`; the pins API response is typed inline in both.
- **Marker** shape differs by layer:
  - **Lambda /pins** returns markers as objects: `{ icon, scale?, position: { x,y,z }, text? }` (see `lambda-handler.mjs` `parseMarkers`).
  - **Admin API** (and DynamoDB) uses tuples: `[icon, scale, [x,y,z], text]`; Admin.tsx has `MarkerPayload` and `MarkerForm` for that.
  - **Viewer** uses `MarkerPayload` (object with position) and converts to `MarkerInput` (position array, radius, texture, label) for `WorldMarkers`.
  - **Editor** uses `EditorMarker` (position, radius, label, icon) and has `parseApiMarkers` plus `editorMarkersToInput`; Admin has `markersFromItem` and `buildPayloadFromForm` (tuple).
- **Field** is in `adminApi.ts` with `markers?: unknown`; Admin and lambda each parse markers in their own way.

So: multiple definitions of “pin”, “field”, and “marker”, and duplicated parsing logic.

**Changes**

### 3a. Add shared types

| File | Change |
|------|--------|
| **New** `src/types/api.ts` (or `src/types/pins.ts`) | Define: (1) **Pin** – same shape as current UBCMap Pin (title, position, path, description, thumbnail, thumbnailAlt, markers?). (2) **MarkerPayloadApi** – the object form returned by GET /pins: `{ icon?: string; scale?: number; position?: { x?: number; y?: number; z?: number }; text?: string }`. (3) **MarkerTuple** – the Admin/DynamoDB form: `[string, number, [number, number, number], string]` (icon, scale, position, text). (4) Optionally **Field** re-export or move from adminApi so one place owns “field” and “markers” meaning. |

### 3b. Centralise marker conversion

| File | Change |
|------|--------|
| **New** `src/lib/markers.ts` (or `src/utils/markerConversion.ts`) | (1) **tupleToMarkerPayload**(tuple: MarkerTuple): MarkerPayloadApi (or a shared “object” shape). (2) **markerPayloadToTuple**(m: MarkerPayloadApi): MarkerTuple (for Admin submit). (3) Optionally **parseMarkersFromPins**(raw: unknown): MarkerPayloadApi[] – safe parse of the pins response markers array. Use these in Viewer, Editor, and Admin so everyone goes through the same conversion. |

### 3c. Use shared Pin type and parsing

| File | Change |
|------|--------|
| `src/UBCMap.tsx` | Import **Pin** from `types/api.ts`. Type the fetch response as `Pin[]` (or a minimal type that matches the API). Remove local `type Pin`. |
| `src/Editor.tsx` | Import **Pin** and marker conversion from the new modules. Replace local Pin-like type and `parseApiMarkers` with the shared **parseMarkersFromPins** (or shared conversion from API shape to EditorMarker/WorldMarkers input). |
| `src/Viewer.tsx` | Import **MarkerPayloadApi** (or shared marker type) and, if you add a shared “to WorldMarkers input” helper, use it here; otherwise keep local parse but type the input as the shared API shape. |
| `src/Admin.tsx` | Import **MarkerTuple** and **MarkerPayloadApi** (or shared form). Use **tupleToMarkerPayload** / **markerPayloadToTuple** from `lib/markers.ts` instead of inline logic in `markersFromItem` and `buildPayloadFromForm`. Keep **MarkerForm** as the form state shape if you want, but have it map to the shared API types via the conversion module. |
| `src/adminApi.ts` | Type **Field**’s `markers` as `MarkerTuple[] | undefined` (or the shared type) so list/create/update are consistent. |

**Scope**

- **New files**: `src/types/api.ts`, `src/lib/markers.ts`.
- **Touch**: UBCMap, Editor, Viewer, Admin, adminApi. No change to Lambda or WorldMarkers API; only frontend types and conversion logic are unified.
- **Lambda**: Already returns markers as objects in GET /pins; no change required. If you later add a GET /fields that returns the same shape, you can use the same types.

**Result**

- One definition of Pin, one of “marker as returned by API” (object), one of “marker as stored” (tuple).
- One place that converts tuple ↔ object and object → WorldMarkers/Editor input.
- Fewer bugs when someone changes the API or the Admin form.

---

## Summary table

| P0 item | New files | Files to edit | Main outcome |
|---------|-----------|----------------|---------------|
| **P0.1** Type guard | None | `Viewer.tsx` | Correct name and type for `loadGaussianScene`; no misleading types. |
| **P0.2a** Cognito/env | Optional `.env.example` | `auth.ts`, `Admin.tsx` | Cognito and logout config from env; easy prod/staging. |
| **P0.2b** AWS keys | Optional (docs only) | `awsClient.ts`, docs | Risk documented; path to proxy/Identity Pool clear. |
| **P0.3** Pin/field/marker types | `src/types/api.ts`, `src/lib/markers.ts` | `UBCMap.tsx`, `Editor.tsx`, `Viewer.tsx`, `Admin.tsx`, `adminApi.ts` | Single Pin/marker types and one conversion layer; consistent parsing everywhere. |

Implementing P0.1 is a few minutes; P0.2a is a small refactor; P0.3 is the largest but is mostly additive (new modules + replace local types and parsing with imports and shared helpers).
