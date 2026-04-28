#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as api from './api.js';

const server = new Server(
  { name: 'zzimkkong', version: '1.1.0' },
  { capabilities: { tools: {} } },
);

// ────────────────── Helpers ──────────────────

const DAY_KO: Record<string, string> = {
  monday: '월', tuesday: '화', wednesday: '수',
  thursday: '목', friday: '금', saturday: '토', sunday: '일',
};

function toKSTDateTime(date: string, time: string): string {
  const [h = '00', m = '00'] = time.split(':');
  return `${date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00+09:00`;
}

function formatDateTime(dt: string): string {
  const date = new Date(dt.endsWith('Z') || dt.includes('+') ? dt : dt + 'Z');
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 16);
}

function formatReservation(r: api.Reservation): string {
  return [
    `  ID: ${r.id}`,
    `  이름: ${r.name}`,
    `  설명: ${r.description}`,
    `  시간: ${formatDateTime(r.reservationTime.startDateTime)} ~ ${formatDateTime(r.reservationTime.endDateTime)}`,
  ].join('\n');
}

function formatMyReservation(r: api.MyReservation): string {
  return [
    `  ID: ${r.id}`,
    `  공간: ${r.spaceName}`,
    `  설명: ${r.description}`,
    `  시간: ${formatDateTime(r.startDateTime)} ~ ${formatDateTime(r.endDateTime)}`,
  ].join('\n');
}

function getFloor(area: string): string {
  try {
    const y = (JSON.parse(area) as { y?: number }).y ?? 0;
    if (y >= 1120) return '13F';
    if (y >= 610) return '12F';
    return '11F';
  } catch {
    return '?F';
  }
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(e: unknown) {
  return { content: [{ type: 'text' as const, text: `오류: ${(e as Error).message}` }], isError: true };
}

async function getUserRole(): Promise<string | null> {
  if (!api.getToken()) return null;
  try {
    const member = await api.getMember();
    return (member.group ?? member.organization)?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

// ────────────────── Tool definitions ──────────────────

const TOOLS: Tool[] = [
  {
    name: 'login_google',
    description: 'Google 계정으로 찜꽁에 로그인합니다. 브라우저가 자동으로 열리고 로그인 완료 후 자동으로 인증됩니다. "구글 로그인", "google로 로그인" 등의 요청에 사용하세요.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'login_github',
    description: 'GitHub 계정으로 찜꽁에 로그인합니다. 브라우저가 자동으로 열리고 로그인 완료 후 자동으로 인증됩니다. "깃헙 로그인", "github로 로그인" 등의 요청에 사용하세요.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'login',
    description: '찜꽁 계정으로 로그인합니다. 로그인하면 코치 전용 회의실도 예약 가능하고 비밀번호 없이 예약/수정/삭제할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: '이메일' },
        password: { type: 'string', description: '비밀번호' },
      },
      required: ['email', 'password'],
    },
  },
  {
    name: 'login_oauth',
    description: 'GitHub/Google OAuth 코드로 찜꽁 로그인합니다. 브라우저에서 OAuth 인증 후 리다이렉트 URL의 code 파라미터를 입력하세요.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'OAuth 제공자 (github 또는 google)' },
        code: { type: 'string', description: 'OAuth 인증 코드' },
      },
      required: ['provider', 'code'],
    },
  },
  {
    name: 'logout',
    description: '찜꽁 로그아웃합니다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_my_info',
    description: '현재 로그인된 찜꽁 계정 정보와 역할(COACH 여부)을 조회합니다. 세션 만료 여부도 확인할 수 있습니다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_last_login_method',
    description: '마지막으로 사용한 찜꽁 로그인 방법을 반환합니다. email / github / google 중 하나이거나 none입니다. 세션 만료 시 로그인 방법 안내에 사용합니다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_spaces',
    description: '판교 캠퍼스의 예약 가능한 회의실 목록을 층별로 조회합니다. 각 공간의 운영 시간, 최대 예약 시간, 가능 요일을 보여줍니다. 로그인 시 코치 전용 공간(🔒)도 표시됩니다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'check_availability',
    description: '특정 날짜·시간대에 예약 가능한 공간을 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '날짜 (예: 2024-04-22)' },
        startTime: { type: 'string', description: '시작 시간 24h HH:mm (예: 09:00)' },
        endTime: { type: 'string', description: '종료 시간 24h HH:mm (예: 10:00)' },
      },
      required: ['date', 'startTime', 'endTime'],
    },
  },
  {
    name: 'list_reservations',
    description: '특정 날짜의 예약 현황을 조회합니다. 공간 이름을 지정하면 해당 공간만 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '날짜 (예: 2024-04-22)' },
        spaceName: { type: 'string', description: '공간 이름 (선택, 없으면 전체)' },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_reservation',
    description: '회의실을 예약합니다. 로그인 상태면 name·password 불필요. 비로그인 시 4자리 숫자 비밀번호를 설정해야 합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: '공간 이름 (예: 지구, 화성, 페 1)' },
        date: { type: 'string', description: '날짜 (예: 2024-04-22)' },
        startTime: { type: 'string', description: '시작 시간 HH:mm (예: 09:00)' },
        endTime: { type: 'string', description: '종료 시간 HH:mm (예: 10:00)' },
        name: { type: 'string', description: '예약자 이름 (비로그인 시 필수, 20자 이내)' },
        description: { type: 'string', description: '예약 목적/설명 (100자 이내)' },
        password: { type: 'string', description: '비밀번호 4자리 숫자 (비로그인 시 필수)' },
      },
      required: ['spaceName', 'date', 'startTime', 'endTime', 'description'],
    },
  },
  {
    name: 'get_reservation',
    description: '예약 ID와 비밀번호로 예약 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: '공간 이름' },
        reservationId: { type: 'number', description: '예약 ID' },
        password: { type: 'string', description: '예약 비밀번호 4자리' },
      },
      required: ['spaceName', 'reservationId', 'password'],
    },
  },
  {
    name: 'update_reservation',
    description: '기존 예약을 수정합니다. 로그인 상태면 name·password 불필요.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: '공간 이름' },
        reservationId: { type: 'number', description: '예약 ID' },
        date: { type: 'string', description: '새 날짜 (예: 2024-04-22)' },
        startTime: { type: 'string', description: '새 시작 시간 HH:mm' },
        endTime: { type: 'string', description: '새 종료 시간 HH:mm' },
        name: { type: 'string', description: '예약자 이름 (비로그인 시 필수)' },
        description: { type: 'string', description: '예약 설명' },
        password: { type: 'string', description: '기존 비밀번호 4자리 (비로그인 시 필수)' },
      },
      required: ['spaceName', 'reservationId', 'date', 'startTime', 'endTime', 'description'],
    },
  },
  {
    name: 'delete_reservation',
    description: '예약을 취소/삭제합니다. 로그인 상태면 password 불필요.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: '공간 이름' },
        reservationId: { type: 'number', description: '예약 ID' },
        password: { type: 'string', description: '예약 비밀번호 4자리 (비로그인 시 필수)' },
      },
      required: ['spaceName', 'reservationId'],
    },
  },
  {
    name: 'find_my_reservations',
    description: '이름으로 내 예약을 검색합니다. 오늘 이후 예약을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '검색할 예약자 이름' },
        fromDate: { type: 'string', description: '검색 시작 날짜 (예: 2024-04-22, 기본: 오늘)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_my_reservations',
    description: '내 예약 목록을 조회합니다. 로그인 필요.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ────────────────── Handlers ──────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {

      // ── login_google / login_github ──────────────
      case 'login_google':
      case 'login_github': {
        const provider = name === 'login_google' ? 'google' : 'github';
        await api.loginWithBrowser(provider);
        const member = await api.getMember();
        api.persistLastEmail(member.email);
        const role = (member.group ?? member.organization)?.toUpperCase() || '없음';
        return ok(
          `✅ ${provider === 'google' ? 'Google' : 'GitHub'} 로그인 성공!\n` +
          `  이름: ${member.userName}\n` +
          `  이메일: ${member.email}\n` +
          `  역할: ${role}`,
        );
      }

      // ── login ────────────────────────────────────
      case 'login': {
        const { email, password } = args as { email: string; password: string };
        await api.loginByEmail(email, password);
        const member = await api.getMember();
        const role = (member.group ?? member.organization)?.toUpperCase() || '없음';
        return ok(
          `✅ 로그인 성공!\n` +
          `  이름: ${member.userName}\n` +
          `  이메일: ${member.email}\n` +
          `  역할: ${role}`,
        );
      }

      // ── login_oauth ──────────────────────────────
      case 'login_oauth': {
        const { provider, code } = args as { provider: string; code: string };
        await api.loginByOauth(provider, code);
        const member = await api.getMember();
        api.persistLastEmail(member.email);
        const role = (member.group ?? member.organization)?.toUpperCase() || '없음';
        return ok(
          `✅ ${provider} 로그인 성공!\n` +
          `  이름: ${member.userName}\n` +
          `  이메일: ${member.email}\n` +
          `  역할: ${role}`,
        );
      }

      // ── logout ───────────────────────────────────
      case 'logout': {
        api.clearToken();
        return ok('✅ 로그아웃 완료');
      }

      // ── get_my_info ──────────────────────────────
      case 'get_my_info': {
        if (!api.getToken()) return ok('로그인되어 있지 않습니다.');
        try {
          const member = await api.getMember();
          const role = (member.group ?? member.organization)?.toUpperCase() || '없음';
          return ok(
            `계정 정보\n${'─'.repeat(40)}\n` +
            `  이름: ${member.userName}\n` +
            `  이메일: ${member.email}\n` +
            `  역할: ${role}`,
          );
        } catch (e) {
          if ((e as Error).message.includes('401')) {
            api.clearToken();
            return ok('세션이 만료되었습니다. 다시 로그인이 필요합니다.');
          }
          throw e;
        }
      }

      // ── get_last_login_method ─────────────────────
      case 'get_last_login_method': {
        return ok(api.getLastLoginMethod() ?? 'none');
      }

      // ── list_spaces ──────────────────────────────
      case 'list_spaces': {
        const userRole = await getUserRole();
        const spaces = await api.listSpaces();
        const reservable = spaces.filter((s) =>
          s.reservationEnable &&
          (s.allowedGroups.length === 0 || (userRole !== null && s.allowedGroups.includes(userRole))),
        );

        const byFloor: Record<string, typeof reservable> = { '11F': [], '12F': [], '13F': [] };
        for (const s of reservable) {
          const f = getFloor(s.area);
          (byFloor[f] ?? (byFloor[f] = [])).push(s);
        }

        const loginNote = userRole ? ` (${userRole} 권한으로 로그인됨)` : ' (비로그인 — 코치 전용 공간 숨김)';
        const lines: string[] = [`판교 캠퍼스 예약 가능 공간 (${reservable.length}개)${loginNote}`];

        for (const [floor, list] of Object.entries(byFloor)) {
          if (list.length === 0) continue;
          lines.push(`\n── ${floor} (${list.length}개) ${'─'.repeat(40)}`);
          for (const s of list) {
            const setting = s.settings[0];
            if (!setting) { lines.push(`  [${s.id}] ${s.name}`); continue; }
            const days = Object.entries(setting.enabledDayOfWeek)
              .filter(([, v]) => v)
              .map(([k]) => DAY_KO[k] ?? k)
              .join('');
            const coachTag = s.allowedGroups.length > 0 ? ' 🔒' : '';
            const maxH = Math.floor(setting.reservationMaximumTimeUnit / 60);
            const maxM = setting.reservationMaximumTimeUnit % 60;
            const maxStr = maxH > 0 ? (maxM > 0 ? `${maxH}시간 ${maxM}분` : `${maxH}시간`) : `${maxM}분`;
            lines.push(`  [${s.id}] ${s.name}${coachTag}  ${setting.settingStartTime.slice(0, 5)}~${setting.settingEndTime.slice(0, 5)} | 최대 ${maxStr} | ${days}`);
          }
        }
        return ok(lines.join('\n'));
      }

      // ── check_availability ───────────────────────
      case 'check_availability': {
        const { date, startTime, endTime } = args as {
          date: string; startTime: string; endTime: string;
        };
        const startDT = toKSTDateTime(date, startTime);
        const endDT = toKSTDateTime(date, endTime);
        const userRole = await getUserRole();
        const spaces = await api.checkAvailability(startDT, endDT);
        const allSpaces = await api.listSpaces();
        const allowedIds = new Set(
          allSpaces
            .filter((s) =>
              s.allowedGroups.length === 0 || (userRole !== null && s.allowedGroups.includes(userRole)),
            )
            .map((s) => s.id),
        );
        const filtered = spaces.filter((s) => allowedIds.has(s.spaceId));
        const available = filtered.filter((s) => s.isAvailable);
        const unavailable = filtered.filter((s) => !s.isAvailable);
        const lines = [
          `${date} ${startTime}~${endTime} 예약 가능 현황`,
          '─'.repeat(40),
          `✅ 예약 가능 (${available.length}개):`,
          ...available.map((s) => {
            const sp = allSpaces.find((x) => x.id === s.spaceId);
            const floor = sp ? ` (${getFloor(sp.area)})` : '';
            return `  [${s.spaceId}] ${s.name}${floor}`;
          }),
          '',
          `❌ 예약 불가 (${unavailable.length}개):`,
          ...unavailable.map((s) => {
            const sp = allSpaces.find((x) => x.id === s.spaceId);
            const floor = sp ? ` (${getFloor(sp.area)})` : '';
            return `  [${s.spaceId}] ${s.name}${floor}`;
          }),
        ];
        return ok(lines.join('\n'));
      }

      // ── list_reservations ────────────────────────
      case 'list_reservations': {
        const { date, spaceName } = args as { date: string; spaceName?: string };

        if (spaceName) {
          const space = await api.findSpaceByName(spaceName);
          const reservations = await api.listSpaceReservations(space.id, date);
          if (reservations.length === 0) {
            return ok(`${date} ${space.name} 예약 없음`);
          }
          const lines = [`${date} [${space.name}] 예약 목록 (${reservations.length}건)`, '─'.repeat(40)];
          reservations.forEach((r) => lines.push(formatReservation(r), ''));
          return ok(lines.join('\n'));
        }

        const allReservations = await api.listReservations(date);
        const withData = allReservations.filter((sr) => sr.reservations.length > 0);
        if (withData.length === 0) {
          return ok(`${date} 예약 없음`);
        }
        const lines = [`${date} 전체 예약 현황`, '─'.repeat(40)];
        for (const sr of withData) {
          lines.push(`\n▸ ${sr.spaceName} (${sr.reservations.length}건)`);
          sr.reservations.forEach((r) => lines.push(formatReservation(r)));
        }
        return ok(lines.join('\n'));
      }

      // ── create_reservation ───────────────────────
      case 'create_reservation': {
        const { spaceName, date, startTime, endTime, name, description, password } = args as {
          spaceName: string; date: string; startTime: string; endTime: string;
          name?: string; description: string; password?: string;
        };
        const space = await api.findSpaceByName(spaceName);
        const startDT = toKSTDateTime(date, startTime);
        const endDT = toKSTDateTime(date, endTime);

        let reservationId: number;
        if (api.getToken()) {
          reservationId = await api.createMemberReservation(space.id, startDT, endDT, description);
          return ok(
            `✅ 예약 완료!\n` +
            `  공간: ${space.name}\n` +
            `  날짜: ${date} ${startTime}~${endTime}\n` +
            `  설명: ${description}\n` +
            `  예약 ID: ${reservationId}`,
          );
        } else {
          if (!name || !password) throw new Error('비로그인 예약은 이름(name)과 비밀번호(password)가 필요합니다.');
          reservationId = await api.createReservation(space.id, startDT, endDT, name, description, password);
          return ok(
            `✅ 예약 완료!\n` +
            `  공간: ${space.name}\n` +
            `  날짜: ${date} ${startTime}~${endTime}\n` +
            `  예약자: ${name}\n` +
            `  설명: ${description}\n` +
            `  예약 ID: ${reservationId}\n` +
            `  ⚠️  비밀번호(${password})를 잊지 마세요. 수정·삭제 시 필요합니다.`,
          );
        }
      }

      // ── get_reservation ──────────────────────────
      case 'get_reservation': {
        const { spaceName, reservationId, password } = args as {
          spaceName: string; reservationId: number; password: string;
        };
        const space = await api.findSpaceByName(spaceName);
        const reservation = await api.getReservation(space.id, reservationId, password);
        return ok(`예약 상세 정보\n${'─'.repeat(40)}\n${formatReservation(reservation)}`);
      }

      // ── update_reservation ───────────────────────
      case 'update_reservation': {
        const { spaceName, reservationId, date, startTime, endTime, name, description, password } = args as {
          spaceName: string; reservationId: number; date: string;
          startTime: string; endTime: string; name?: string; description: string; password?: string;
        };
        const space = await api.findSpaceByName(spaceName);
        const startDT = toKSTDateTime(date, startTime);
        const endDT = toKSTDateTime(date, endTime);

        if (api.getToken()) {
          await api.updateMemberReservation(space.id, reservationId, startDT, endDT, description);
        } else {
          if (!name || !password) throw new Error('비로그인 수정은 이름(name)과 비밀번호(password)가 필요합니다.');
          await api.updateReservation(space.id, reservationId, startDT, endDT, name, description, password);
        }
        return ok(
          `✅ 예약 수정 완료!\n` +
          `  공간: ${space.name}\n` +
          `  새 시간: ${date} ${startTime}~${endTime}\n` +
          `  설명: ${description}`,
        );
      }

      // ── delete_reservation ───────────────────────
      case 'delete_reservation': {
        const { spaceName, reservationId, password } = args as {
          spaceName: string; reservationId: number; password?: string;
        };
        const space = await api.findSpaceByName(spaceName);

        if (api.getToken()) {
          await api.deleteMemberReservation(space.id, reservationId);
        } else {
          if (!password) throw new Error('비로그인 삭제는 비밀번호(password)가 필요합니다.');
          await api.deleteReservation(space.id, reservationId, password);
        }
        return ok(`✅ 예약(ID: ${reservationId}) 삭제 완료`);
      }

      // ── find_my_reservations ─────────────────────
      case 'find_my_reservations': {
        const { name, fromDate } = args as { name: string; fromDate?: string };
        const today = fromDate ?? new Date().toISOString().slice(0, 10);
        const searchStartTime = toKSTDateTime(today, '00:00');
        const reservations = await api.findMyReservations(name, searchStartTime);
        if (reservations.length === 0) {
          return ok(`"${name}" 이름으로 ${today} 이후 예약 없음`);
        }
        const lines = [`"${name}" 예약 목록 (${reservations.length}건)`, '─'.repeat(40)];
        reservations.forEach((r) => lines.push(formatReservation(r), ''));
        return ok(lines.join('\n'));
      }

      // ── get_my_reservations ──────────────────────
      case 'get_my_reservations': {
        const reservations = await api.getMyReservations();
        if (reservations.length === 0) {
          return ok('예약 없음');
        }
        const lines = [`내 예약 목록 (${reservations.length}건)`, '─'.repeat(40)];
        reservations.forEach((r) => lines.push(formatMyReservation(r), ''));
        return ok(lines.join('\n'));
      }

      default:
        return err(new Error(`알 수 없는 도구: ${name}`));
    }
  } catch (e) {
    return err(e);
  }
});

// ────────────────── Start ──────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
