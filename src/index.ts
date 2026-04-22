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
  { name: 'zzimkkong', version: '1.0.0' },
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
  // e.g. "2024-04-22T09:00:00+09:00" → "2024-04-22 09:00"
  return dt.replace('T', ' ').slice(0, 16);
}

function formatReservation(r: api.Reservation): string {
  return [
    `  ID: ${r.id}`,
    `  이름: ${r.name}`,
    `  설명: ${r.description}`,
    `  시간: ${formatDateTime(r.reservationTime.startDateTime)} ~ ${formatDateTime(r.reservationTime.endDateTime)}`,
  ].join('\n');
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(e: unknown) {
  return { content: [{ type: 'text' as const, text: `오류: ${(e as Error).message}` }], isError: true };
}

// ────────────────── Tool definitions ──────────────────

const TOOLS: Tool[] = [
  {
    name: 'list_spaces',
    description: '판교 캠퍼스의 예약 가능한 회의실/공간 목록과 운영 시간을 조회합니다.',
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
    description: '회의실을 예약합니다. 수정·삭제 시 필요한 4자리 숫자 비밀번호를 설정해야 합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: '공간 이름 (예: 지구, 화성, 페 1)' },
        date: { type: 'string', description: '날짜 (예: 2024-04-22)' },
        startTime: { type: 'string', description: '시작 시간 HH:mm (예: 09:00)' },
        endTime: { type: 'string', description: '종료 시간 HH:mm (예: 10:00)' },
        name: { type: 'string', description: '예약자 이름 (20자 이내, -_!?., 허용)' },
        description: { type: 'string', description: '예약 목적/설명 (100자 이내)' },
        password: { type: 'string', description: '비밀번호 4자리 숫자 (예: 1234)' },
      },
      required: ['spaceName', 'date', 'startTime', 'endTime', 'name', 'description', 'password'],
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
    description: '기존 예약을 수정합니다. 예약 시 설정한 비밀번호가 필요합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: '공간 이름' },
        reservationId: { type: 'number', description: '예약 ID' },
        date: { type: 'string', description: '새 날짜 (예: 2024-04-22)' },
        startTime: { type: 'string', description: '새 시작 시간 HH:mm' },
        endTime: { type: 'string', description: '새 종료 시간 HH:mm' },
        name: { type: 'string', description: '예약자 이름' },
        description: { type: 'string', description: '예약 설명' },
        password: { type: 'string', description: '기존 비밀번호 4자리' },
      },
      required: ['spaceName', 'reservationId', 'date', 'startTime', 'endTime', 'name', 'description', 'password'],
    },
  },
  {
    name: 'delete_reservation',
    description: '예약을 취소/삭제합니다. 예약 시 설정한 비밀번호가 필요합니다.',
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
];

// ────────────────── Handlers ──────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      // ── list_spaces ──────────────────────────────────
      case 'list_spaces': {
        const spaces = await api.listSpaces();
        const reservable = spaces.filter((s) => s.reservationEnable);
        const lines = reservable.map((s) => {
          const setting = s.settings[0];
          if (!setting) return `[${s.id}] ${s.name}`;
          const days = Object.entries(setting.enabledDayOfWeek)
            .filter(([, v]) => v)
            .map(([k]) => DAY_KO[k] ?? k)
            .join('');
          return `[${s.id}] ${s.name.padEnd(12)} ${setting.settingStartTime.slice(0, 5)}~${setting.settingEndTime.slice(0, 5)} | 단위 ${setting.reservationTimeUnit}분 | 최대 ${setting.reservationMaximumTimeUnit}분 | ${days}`;
        });
        return ok(`판교 캠퍼스 예약 가능 공간 (${reservable.length}개)\n${'─'.repeat(60)}\n${lines.join('\n')}`);
      }

      // ── check_availability ───────────────────────────
      case 'check_availability': {
        const { date, startTime, endTime } = args as {
          date: string; startTime: string; endTime: string;
        };
        const startDT = toKSTDateTime(date, startTime);
        const endDT = toKSTDateTime(date, endTime);
        const spaces = await api.checkAvailability(startDT, endDT);
        const available = spaces.filter((s) => s.isAvailable);
        const unavailable = spaces.filter((s) => !s.isAvailable);
        const lines = [
          `${date} ${startTime}~${endTime} 예약 가능 현황`,
          '─'.repeat(40),
          `✅ 예약 가능 (${available.length}개):`,
          ...available.map((s) => `  [${s.spaceId}] ${s.name}`),
          '',
          `❌ 예약 불가 (${unavailable.length}개):`,
          ...unavailable.map((s) => `  [${s.spaceId}] ${s.name}`),
        ];
        return ok(lines.join('\n'));
      }

      // ── list_reservations ────────────────────────────
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

      // ── create_reservation ───────────────────────────
      case 'create_reservation': {
        const { spaceName, date, startTime, endTime, name, description, password } = args as {
          spaceName: string; date: string; startTime: string; endTime: string;
          name: string; description: string; password: string;
        };
        const space = await api.findSpaceByName(spaceName);
        const startDT = toKSTDateTime(date, startTime);
        const endDT = toKSTDateTime(date, endTime);
        const reservationId = await api.createReservation(
          space.id, startDT, endDT, name, description, password,
        );
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

      // ── get_reservation ──────────────────────────────
      case 'get_reservation': {
        const { spaceName, reservationId, password } = args as {
          spaceName: string; reservationId: number; password: string;
        };
        const space = await api.findSpaceByName(spaceName);
        const reservation = await api.getReservation(space.id, reservationId, password);
        return ok(`예약 상세 정보\n${'─'.repeat(40)}\n${formatReservation(reservation)}`);
      }

      // ── update_reservation ───────────────────────────
      case 'update_reservation': {
        const { spaceName, reservationId, date, startTime, endTime, name, description, password } = args as {
          spaceName: string; reservationId: number; date: string;
          startTime: string; endTime: string; name: string; description: string; password: string;
        };
        const space = await api.findSpaceByName(spaceName);
        const startDT = toKSTDateTime(date, startTime);
        const endDT = toKSTDateTime(date, endTime);
        await api.updateReservation(space.id, reservationId, startDT, endDT, name, description, password);
        return ok(
          `✅ 예약 수정 완료!\n` +
          `  공간: ${space.name}\n` +
          `  새 시간: ${date} ${startTime}~${endTime}\n` +
          `  예약자: ${name}`,
        );
      }

      // ── delete_reservation ───────────────────────────
      case 'delete_reservation': {
        const { spaceName, reservationId, password } = args as {
          spaceName: string; reservationId: number; password: string;
        };
        const space = await api.findSpaceByName(spaceName);
        await api.deleteReservation(space.id, reservationId, password);
        return ok(`✅ 예약(ID: ${reservationId}) 삭제 완료`);
      }

      // ── find_my_reservations ─────────────────────────
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
