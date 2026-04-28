import https from 'https';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import os from 'os';
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.ZZIMKKONG_BASE_URL ?? 'https://k8s.zzimkkong.com';
export const MAP_ID = parseInt(process.env.ZZIMKKONG_MAP_ID ?? '234', 10);

const agent = new https.Agent({ rejectUnauthorized: false });

// ────────────────── Token management ──────────────────

const TOKEN_DIR = path.join(os.homedir(), '.zzimkkong-mcp');
const TOKEN_FILE = path.join(TOKEN_DIR, 'token');
const LAST_LOGIN_FILE = path.join(TOKEN_DIR, 'last-login-method');
const LAST_EMAIL_FILE = path.join(TOKEN_DIR, 'last-email');

function loadPersistedToken(): string | null {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

function persistToken(token: string | null): void {
  try {
    if (token) {
      fs.mkdirSync(TOKEN_DIR, { recursive: true });
      fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
    } else {
      fs.rmSync(TOKEN_FILE, { force: true });
    }
  } catch { /* ignore */ }
}

function persistLastLoginMethod(method: string): void {
  try {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
    fs.writeFileSync(LAST_LOGIN_FILE, method, { mode: 0o600 });
  } catch { /* ignore */ }
}

export function getLastLoginMethod(): string | null {
  try {
    return fs.readFileSync(LAST_LOGIN_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

export function persistLastEmail(email: string): void {
  try {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
    fs.writeFileSync(LAST_EMAIL_FILE, email, { mode: 0o600 });
  } catch { /* ignore */ }
}

export function getLastEmail(): string | null {
  try {
    return fs.readFileSync(LAST_EMAIL_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

let _token: string | null = process.env.ZZIMKKONG_TOKEN ?? loadPersistedToken();

export function getToken(): string | null { return _token; }
export function setToken(token: string): void { _token = token; persistToken(token); }
export function clearToken(): void { _token = null; persistToken(null); }

// ────────────────── Types ──────────────────

export interface Space {
  id: number;
  name: string;
  color: string;
  area: string;
  reservationEnable: boolean;
  allowedGroups: string[];
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

export interface MemberInfo {
  id: number;
  email: string;
  userName: string;
  organization: string | null;
  group: string | null;
}

export interface MyReservation {
  id: number;
  startDateTime: string;
  endDateTime: string;
  name: string;
  description: string;
  spaceName: string;
  spaceId: number;
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

// ────────────────── Auth ──────────────────

export async function loginByEmail(email: string, password: string): Promise<void> {
  const res = await request<{ accessToken: string }>(
    'POST', '/api/members/login/token', { email, password },
  );
  setToken(res.accessToken);
  persistLastLoginMethod('email');
  persistLastEmail(email);
}

export async function loginByOauth(provider: string, code: string): Promise<void> {
  const res = await rawRequest('GET', `/api/members/${provider}/login/token?code=${code}`);
  if (res.status === 404) {
    const body = JSON.parse(res.body) as { email?: string };
    throw new Error(`가입되지 않은 계정입니다. 먼저 찜꽁 회원가입을 진행해주세요. (email: ${body.email ?? ''})`);
  }
  if (res.status < 200 || res.status >= 300) {
    let msg = res.body;
    try { msg = (JSON.parse(res.body) as { message?: string }).message ?? msg; } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  const data = JSON.parse(res.body) as { accessToken: string };
  setToken(data.accessToken);
  persistLastLoginMethod(provider);
}

export async function getMember(): Promise<MemberInfo> {
  const token = _token;
  if (!token) throw new Error('로그인이 필요합니다.');
  return request<MemberInfo>('GET', '/api/members/me', undefined, token);
}

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OAUTH_REDIRECT_BASE = 'https://zzimkkong.com/login/oauth';

function buildOAuthUrl(provider: string): string {
  const redirectUri = `${OAUTH_REDIRECT_BASE}/${provider}`;
  if (provider === 'github') {
    return (
      'https://github.com/login/oauth/authorize' +
      '?client_id=378d2c8cdd571f1f8aca' +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`
    );
  }
  if (provider === 'google') {
    return (
      'https://accounts.google.com/o/oauth2/v2/auth' +
      '?scope=https://www.googleapis.com/auth/userinfo.email' +
      '&access_type=offline' +
      '&include_granted_scopes=true' +
      '&response_type=code' +
      '&state=state_parameter_passthrough_value' +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      '&client_id=350852545256-9r8sj68t72bc880ug8e594j9dolimu88.apps.googleusercontent.com'
    );
  }
  throw new Error(`지원하지 않는 OAuth 제공자: ${provider}`);
}

export async function loginWithBrowser(provider: string): Promise<void> {
  const oauthUrl = buildOAuthUrl(provider);
  const redirectPrefix = `${OAUTH_REDIRECT_BASE}/${provider}`;

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(oauthUrl);

    const lastEmail = getLastEmail();
    if (lastEmail) {
      const selector = provider === 'google' ? '#identifierId' : '#login_field';
      try {
        await page.waitForSelector(selector, { timeout: 4000 });
        await page.type(selector, lastEmail);
      } catch { /* 필드를 찾지 못하면 수동 입력 */ }
    }

    const redirectedUrl = await page.waitForRequest(
      (req) => req.url().startsWith(redirectPrefix),
      { timeout: 120_000 },
    );

    const code = new URL(redirectedUrl.url()).searchParams.get('code');
    if (!code) throw new Error('OAuth 코드를 받지 못했습니다.');

    await loginByOauth(provider, code);
  } finally {
    await browser.close();
  }
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

export async function createMemberReservation(
  spaceId: number,
  startDateTime: string,
  endDateTime: string,
  description: string,
): Promise<number> {
  const token = _token;
  if (!token) throw new Error('로그인이 필요합니다.');
  const res = await rawRequest(
    'POST',
    `/api/guests/maps/${MAP_ID}/spaces/${spaceId}/reservations`,
    { startDateTime, endDateTime, description },
    token,
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

export async function updateMemberReservation(
  spaceId: number,
  reservationId: number,
  startDateTime: string,
  endDateTime: string,
  description: string,
): Promise<void> {
  const token = _token;
  if (!token) throw new Error('로그인이 필요합니다.');
  await request<void>(
    'PUT',
    `/api/guests/maps/${MAP_ID}/spaces/${spaceId}/reservations/${reservationId}`,
    { startDateTime, endDateTime, description },
    token,
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

export async function deleteMemberReservation(
  spaceId: number,
  reservationId: number,
): Promise<void> {
  const token = _token;
  if (!token) throw new Error('로그인이 필요합니다.');
  const res = await rawRequest(
    'DELETE',
    `/api/guests/maps/${MAP_ID}/spaces/${spaceId}/reservations/${reservationId}`,
    { password: null },
    token,
  );
  if (res.status < 200 || res.status >= 300) {
    let msg = res.body;
    try { msg = (JSON.parse(res.body) as { message?: string }).message ?? msg; } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
}

export async function getMyReservations(): Promise<MyReservation[]> {
  const token = _token;
  if (!token) throw new Error('로그인이 필요합니다.');
  const all: MyReservation[] = [];
  let page = 0;
  while (true) {
    const res = await request<{ data: MyReservation[]; hasNext: boolean }>(
      'GET', `/api/guests/reservations?page=${page}`, undefined, token,
    );
    all.push(...(res.data ?? []));
    if (!res.hasNext) break;
    page++;
  }
  return all;
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
