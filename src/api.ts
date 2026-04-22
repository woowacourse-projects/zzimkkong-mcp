import https from 'https';
import { URL } from 'url';

const BASE_URL = process.env.ZZIMKKONG_BASE_URL ?? 'https://k8s.zzimkkong.com';
export const MAP_ID = parseInt(process.env.ZZIMKKONG_MAP_ID ?? '234', 10);

const agent = new https.Agent({ rejectUnauthorized: false });

// ────────────────── Types ──────────────────

export interface Space {
  id: number;
  name: string;
  color: string;
  reservationEnable: boolean;
  settings: Setting[];
}

export interface Setting {
  settingId: number;
  settingStartTime: string;
  settingEndTime: string;
  reservationTimeUnit: number;
  reservationMinimumTimeUnit: number;
  reservationMaximumTimeUnit: number;
  enabledDayOfWeek: Record<string, boolean>;
}

export interface Reservation {
  id: number;
  reservationTime: { startDateTime: string; endDateTime: string };
  name: string;
  description: string;
}

export interface SpaceAvailability {
  spaceId: number;
  name: string;
  isAvailable: boolean;
}

export interface SpaceReservations {
  spaceId: number;
  spaceName: string;
  reservations: Reservation[];
}

// ────────────────── HTTP client ──────────────────

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function rawRequest(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const bodyBuf = body !== undefined ? Buffer.from(JSON.stringify(body)) : undefined;

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(bodyBuf && { 'Content-Length': bodyBuf.length }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      agent,
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body: Buffer.concat(chunks).toString(),
        });
      });
    });

    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await rawRequest(method, path, body, token);
  if (res.status >= 200 && res.status < 300) {
    return (res.body ? JSON.parse(res.body) : {}) as T;
  }
  let msg = res.body;
  try {
    const parsed = JSON.parse(res.body) as { message?: string };
    msg = parsed.message ?? msg;
  } catch { /* ignore */ }
  throw new Error(`HTTP ${res.status}: ${msg}`);
}

// ────────────────── Space cache ──────────────────

let spaceCache: Space[] | null = null;

export async function listSpaces(): Promise<Space[]> {
  if (!spaceCache) {
    const res = await request<{ spaces: Space[] }>('GET', `/api/guests/maps/${MAP_ID}/spaces`);
    spaceCache = res.spaces;
  }
  return spaceCache;
}

export function clearSpaceCache(): void {
  spaceCache = null;
}

export async function findSpaceByName(name: string): Promise<Space> {
  const spaces = await listSpaces();
  const lower = name.toLowerCase();
  const match = spaces.find((s) => s.name.toLowerCase() === lower)
    ?? spaces.find((s) => s.name.toLowerCase().includes(lower));
  if (!match) {
    const names = spaces.filter((s) => s.reservationEnable).map((s) => s.name).join(', ');
    throw new Error(`공간 "${name}"을 찾을 수 없습니다. 예약 가능한 공간: ${names}`);
  }
  return match;
}

// ────────────────── API functions ──────────────────

export async function checkAvailability(
  startDateTime: string,
  endDateTime: string,
): Promise<SpaceAvailability[]> {
  const params = new URLSearchParams({ startDateTime, endDateTime });
  const [res, spaces] = await Promise.all([
    request<{ spaces: Array<{ spaceId: number; isAvailable: boolean }> }>(
      'GET',
      `/api/guests/maps/${MAP_ID}/spaces/availability?${params}`,
    ),
    listSpaces(),
  ]);
  const nameById = new Map(spaces.map((s) => [s.id, s.name]));
  return (res.spaces ?? []).map((s) => ({
    spaceId: s.spaceId,
    name: nameById.get(s.spaceId) ?? `공간 ${s.spaceId}`,
    isAvailable: s.isAvailable,
  }));
}

export async function listReservations(date: string): Promise<SpaceReservations[]> {
  const params = new URLSearchParams({ date });
  const res = await request<{ reservations: SpaceReservations[] }>(
    'GET',
    `/api/guests/maps/${MAP_ID}/spaces/reservations?${params}`,
  );
  return res.reservations ?? [];
}

export async function listSpaceReservations(spaceId: number, date: string): Promise<Reservation[]> {
  const params = new URLSearchParams({ date });
  const res = await request<{ reservations: Reservation[] }>(
    'GET',
    `/api/guests/maps/${MAP_ID}/spaces/${spaceId}/reservations?${params}`,
  );
  return res.reservations ?? [];
}

export async function createReservation(
  spaceId: number,
  startDateTime: string,
  endDateTime: string,
  name: string,
  description: string,
  password: string,
): Promise<number> {
  const res = await rawRequest(
    'POST',
    `/api/guests/maps/${MAP_ID}/spaces/${spaceId}/reservations`,
    { startDateTime, endDateTime, name, description, password },
  );
  if (res.status === 201) {
    const location = (res.headers['location'] as string | undefined) ?? '';
    return parseInt(location.split('/').pop() ?? '0', 10);
  }
  let msg = res.body;
  try { msg = (JSON.parse(res.body) as { message?: string }).message ?? msg; } catch { /* ignore */ }
  throw new Error(`HTTP ${res.status}: ${msg}`);
}

export async function getReservation(
  spaceId: number,
  reservationId: number,
  password: string,
): Promise<Reservation> {
  return request<Reservation>(
    'POST',
    `/api/guests/maps/${MAP_ID}/spaces/${spaceId}/reservations/${reservationId}`,
    { password },
  );
}

export async function updateReservation(
  spaceId: number,
  reservationId: number,
  startDateTime: string,
  endDateTime: string,
  name: string,
  description: string,
  password: string,
): Promise<void> {
  await request<void>(
    'PUT',
    `/api/guests/maps/${MAP_ID}/spaces/${spaceId}/reservations/${reservationId}`,
    { startDateTime, endDateTime, name, description, password },
  );
}

export async function deleteReservation(
  spaceId: number,
  reservationId: number,
  password: string,
): Promise<void> {
  await request<void>(
    'DELETE',
    `/api/guests/maps/${MAP_ID}/spaces/${spaceId}/reservations/${reservationId}`,
    { password },
  );
}

export async function findMyReservations(
  userName: string,
  searchStartTime: string,
): Promise<Reservation[]> {
  const params = new URLSearchParams({ userName, searchStartTime });
  const res = await request<{ reservations: Reservation[] }>(
    'GET',
    `/api/guests/non-login/reservations?${params}`,
  );
  return res.reservations ?? [];
}
