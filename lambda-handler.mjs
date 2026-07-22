import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || "ca-central-1";
const TABLE = process.env.GARDEN_TABLE_NAME || "cofood-garden-capture-prod-garden";

const ENTITY_CAPTURE = "capture";
const ENTITY_HOTSPOT = "hotspot";

/** Empty / "*" = all captures; otherwise comma-separated Id allowlist for public GET /captures. */
function parseIdFilter(raw) {
  if (raw === undefined || raw === null) return [];
  const trimmed = String(raw).trim();
  if (trimmed === "" || trimmed === "*") return [];
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

const publicCaptureIds = parseIdFilter(process.env.PUBLIC_CAPTURE_IDS);

const corsAllowOrigins = (process.env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function requestOrigin(event) {
  const headers = event?.headers ?? {};
  return headers.origin ?? headers.Origin;
}

/** Echo the browser Origin when allowed — required for admin + viewer on different CloudFront domains. */
function corsHeaders(event) {
  const origin = requestOrigin(event);
  const headers = {
    "Content-Type": "application/json",
  };

  if (origin && corsAllowOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  return headers;
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const unwrapAttributeValue = (attr) => {
  if (attr === null || attr === undefined) return undefined;
  if (Array.isArray(attr)) return attr.map(unwrapAttributeValue);
  if (typeof attr !== "object") return attr;
  if ("S" in attr) return attr.S;
  if ("N" in attr) return Number(attr.N);
  if ("BOOL" in attr) return attr.BOOL;
  if ("NULL" in attr) return null;
  if ("L" in attr && Array.isArray(attr.L)) {
    return attr.L.map(unwrapAttributeValue);
  }
  if ("M" in attr && attr.M && typeof attr.M === "object") {
    return Object.fromEntries(
      Object.entries(attr.M).map(([key, value]) => [
        key,
        unwrapAttributeValue(value),
      ]),
    );
  }
  return attr;
};

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toStringValue = (value) =>
  typeof value === "string" ? value : undefined;

function parsePosition(raw) {
  const normalized = unwrapAttributeValue(raw);
  if (Array.isArray(normalized) && normalized.length >= 3) {
    const [x, y, z] = normalized.slice(0, 3).map((value) => toNumber(value));
    if ([x, y, z].every((value) => typeof value === "number")) {
      return { x, y, z };
    }
  }
  if (normalized && typeof normalized === "object") {
    const x = toNumber(normalized.x);
    const y = toNumber(normalized.y);
    const z = toNumber(normalized.z);
    if ([x, y, z].every((value) => typeof value === "number")) {
      return { x, y, z };
    }
  }
  return undefined;
}

function isPublicVisibility(item) {
  const visibility = toStringValue(item.visibility) ?? "public";
  return visibility === "public";
}

function toPublicCapture(item) {
  return {
    id: item.Id,
    siteId: toStringValue(item.siteId),
    label: toStringValue(item.label) ?? "",
    capturedAt: toStringValue(item.capturedAt),
    splatUrl: toStringValue(item.splatUrl),
    thumbnailUrl: toStringValue(item.thumbnailUrl),
    notes: toStringValue(item.notes),
    visibility: toStringValue(item.visibility) ?? "public",
  };
}

function toPublicHotspot(item) {
  return {
    id: item.Id,
    captureId: toStringValue(item.captureId),
    position: parsePosition(item.position),
    icon: toStringValue(item.icon),
    scale: toNumber(item.scale) ?? undefined,
    title: toStringValue(item.title) ?? "",
    summary: toStringValue(item.summary) ?? "",
    contentType: toStringValue(item.contentType),
    tags: Array.isArray(item.tags) ? item.tags : [],
    visibility: toStringValue(item.visibility) ?? "public",
    media: Array.isArray(item.media) ? item.media : [],
  };
}

async function scanByEntityType(entityType) {
  const data = await ddb.send(new ScanCommand({ TableName: TABLE }));
  return (data.Items || []).filter((item) => item.EntityType === entityType);
}

async function getById(id) {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { Id: id } }),
  );
  return res.Item || null;
}

async function listPublicCaptures() {
  const items = await scanByEntityType(ENTITY_CAPTURE);
  const filterSet = new Set(publicCaptureIds);
  return items
    .filter((item) => isPublicVisibility(item))
    .filter((item) =>
      filterSet.size === 0 ? true : filterSet.has(String(item.Id)),
    )
    .map(toPublicCapture);
}

async function getPublicCapture(id) {
  const item = await getById(id);
  if (!item || item.EntityType !== ENTITY_CAPTURE) return null;
  if (!isPublicVisibility(item)) return null;
  return toPublicCapture(item);
}

async function listPublicHotspots(captureId) {
  const items = await scanByEntityType(ENTITY_HOTSPOT);
  return items
    .filter((item) => isPublicVisibility(item))
    .filter((item) =>
      captureId ? toStringValue(item.captureId) === captureId : true,
    )
    .map(toPublicHotspot);
}

async function listAdminCaptures() {
  return { items: await scanByEntityType(ENTITY_CAPTURE) };
}

async function listAdminHotspots(captureId) {
  const items = await scanByEntityType(ENTITY_HOTSPOT);
  return {
    items: captureId
      ? items.filter((item) => toStringValue(item.captureId) === captureId)
      : items,
  };
}

async function putEntity(entityType, body) {
  const id = body?.Id ?? body?.id;
  if (!id) throw new Error("Id required");
  const item = {
    ...body,
    Id: id,
    EntityType: entityType,
  };
  delete item.id;
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return { item };
}

async function updateEntity(entityType, body) {
  const id = body?.Id ?? body?.id;
  if (!id) throw new Error("Id required");
  const existing = await getById(id);
  if (!existing || existing.EntityType !== entityType) return null;
  const merged = {
    ...existing,
    ...body,
    Id: id,
    EntityType: entityType,
  };
  delete merged.id;
  await ddb.send(new PutCommand({ TableName: TABLE, Item: merged }));
  return { item: merged };
}

async function deleteEntity(entityType, id) {
  if (!id) throw new Error("Id required");
  const existing = await getById(id);
  if (existing && existing.EntityType !== entityType) {
    throw new Error(`Id is not a ${entityType}`);
  }
  await ddb.send(
    new DeleteCommand({ TableName: TABLE, Key: { Id: id } }),
  );
}

function parseJsonBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw);
}

function queryParam(event, name) {
  const params = event.queryStringParameters || {};
  return params[name] || undefined;
}

export const handler = async (event) => {
  const path = event.rawPath || event.path;
  const method = event.requestContext?.http?.method || event.httpMethod;

  try {
    if (method === "GET" && path === "/captures") {
      return json(200, { items: await listPublicCaptures() }, event);
    }

    const captureMatch = path.match(/^\/captures\/([^/]+)$/);
    if (method === "GET" && captureMatch) {
      const item = await getPublicCapture(decodeURIComponent(captureMatch[1]));
      return item
        ? json(200, item, event)
        : json(404, { error: "Not found" }, event);
    }

    if (method === "GET" && path === "/hotspots") {
      const captureId = queryParam(event, "captureId");
      return json(200, { items: await listPublicHotspots(captureId) }, event);
    }

    if (path === "/admin/api/captures") {
      if (method === "GET") {
        return json(200, await listAdminCaptures(), event);
      }
      if (method === "POST") {
        const body = parseJsonBody(event);
        return json(201, await putEntity(ENTITY_CAPTURE, body), event);
      }
      if (method === "PUT") {
        const body = parseJsonBody(event);
        const result = await updateEntity(ENTITY_CAPTURE, body);
        return result
          ? json(200, result, event)
          : json(404, { error: "Not found" }, event);
      }
      if (method === "DELETE") {
        const body = parseJsonBody(event);
        await deleteEntity(ENTITY_CAPTURE, body?.Id ?? body?.id);
        return json(204, null, event);
      }
    }

    if (path === "/admin/api/hotspots") {
      if (method === "GET") {
        const captureId = queryParam(event, "captureId");
        return json(200, await listAdminHotspots(captureId), event);
      }
      if (method === "POST") {
        const body = parseJsonBody(event);
        if (!(body?.captureId || body?.CaptureId)) {
          return json(400, { error: "captureId required" }, event);
        }
        const normalized = {
          ...body,
          captureId: body.captureId ?? body.CaptureId,
        };
        return json(201, await putEntity(ENTITY_HOTSPOT, normalized), event);
      }
      if (method === "PUT") {
        const body = parseJsonBody(event);
        const result = await updateEntity(ENTITY_HOTSPOT, body);
        return result
          ? json(200, result, event)
          : json(404, { error: "Not found" }, event);
      }
      if (method === "DELETE") {
        const body = parseJsonBody(event);
        await deleteEntity(ENTITY_HOTSPOT, body?.Id ?? body?.id);
        return json(204, null, event);
      }
    }

    return json(404, { error: "Not found" }, event);
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error" }, event);
  }
};

const json = (status, body, event) => ({
  statusCode: status,
  headers: corsHeaders(event),
  body: body === null || body === undefined ? "" : JSON.stringify(body),
});
