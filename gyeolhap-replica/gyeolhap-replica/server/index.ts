import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  createBoard,
  hasAnyCombination,
  isValidCombination,
  replaceCombination,
  type Card,
  type PublicPlayer,
  type RoomSnapshot,
  type RoomStatus,
} from '../src/shared/game';

interface Player {
  id: string;
  nickname: string;
  score: number;
  penaltyUntil: number;
}

interface GameRoom {
  code: string;
  hostId: string;
  status: RoomStatus;
  roundsTotal: number;
  roundNumber: number;
  claimSeconds: number;
  penaltySeconds: number;
  board: Card[];
  players: Map<string, Player>;
  claimantId: string | null;
  claimDeadline: number | null;
  claimTimer: ReturnType<typeof setTimeout> | null;
  message: string;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
const rooms = new Map<string, GameRoom>();
const socketRoom = new Map<string, string>();
const PORT = Number(process.env.PORT ?? 3001);

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(currentDir, '../dist');
app.use(express.static(distDir));
app.get('/health', (_request, response) => response.json({ ok: true, activeRooms: rooms.size }));
app.get('*', (_request, response, next) => {
  response.sendFile(path.join(distDir, 'index.html'), (error) => {
    if (error) next();
  });
});

function publicPlayer(player: Player, room: GameRoom): PublicPlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    score: player.score,
    isHost: player.id === room.hostId,
    penaltyUntil: player.penaltyUntil,
  };
}

function snapshot(room: GameRoom): RoomSnapshot {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    roundsTotal: room.roundsTotal,
    roundNumber: room.roundNumber,
    claimSeconds: room.claimSeconds,
    penaltySeconds: room.penaltySeconds,
    board: room.board,
    players: [...room.players.values()].map((player) => publicPlayer(player, room)),
    claimantId: room.claimantId,
    claimDeadline: room.claimDeadline,
    message: room.message,
  };
}

function broadcast(room: GameRoom) {
  io.to(room.code).emit('room:update', snapshot(room));
}

function roomFor(socket: Socket): GameRoom | undefined {
  const code = socketRoom.get(socket.id);
  return code ? rooms.get(code) : undefined;
}

function clearClaim(room: GameRoom) {
  if (room.claimTimer) clearTimeout(room.claimTimer);
  room.claimTimer = null;
  room.claimantId = null;
  room.claimDeadline = null;
}

function randomRoomCode(): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  throw new Error('Unable to allocate a room code');
}

function normalizeNickname(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 16) : '';
}

function removePlayer(socket: Socket) {
  const code = socketRoom.get(socket.id);
  if (!code) return;
  socketRoom.delete(socket.id);
  socket.leave(code);
  const room = rooms.get(code);
  if (!room) return;
  room.players.delete(socket.id);
  if (room.players.size === 0) {
    clearClaim(room);
    rooms.delete(code);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value as string;
    room.message = `${room.players.get(room.hostId)?.nickname ?? '다른 참가자'} 님이 진행자가 되었어요.`;
  }
  if (room.claimantId === socket.id) {
    clearClaim(room);
    room.message = '선택 중이던 참가자가 나가서 다시 도전할 수 있어요.';
  }
  broadcast(room);
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload: unknown, acknowledge?: (result: unknown) => void) => {
    const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const nickname = normalizeNickname(data.nickname);
    if (!nickname) {
      acknowledge?.({ ok: false, message: '닉네임을 입력해 주세요.' });
      return;
    }
    try {
      removePlayer(socket);
      const code = randomRoomCode();
      const player: Player = { id: socket.id, nickname, score: 0, penaltyUntil: 0 };
      const room: GameRoom = {
        code,
        hostId: socket.id,
        status: 'waiting',
        roundsTotal: [3, 5, 10].includes(Number(data.roundsTotal)) ? Number(data.roundsTotal) : 5,
        roundNumber: 0,
        claimSeconds: [5, 10, 15, 20].includes(Number(data.claimSeconds)) ? Number(data.claimSeconds) : 10,
        penaltySeconds: [0, 3, 5, 10].includes(Number(data.penaltySeconds)) ? Number(data.penaltySeconds) : 3,
        board: [],
        players: new Map([[socket.id, player]]),
        claimantId: null,
        claimDeadline: null,
        claimTimer: null,
        message: '참가자를 기다리고 있어요. 방 코드를 공유해 주세요!',
      };
      rooms.set(code, room);
      socket.join(code);
      socketRoom.set(socket.id, code);
      acknowledge?.({ ok: true, playerId: socket.id, room: snapshot(room) });
      broadcast(room);
    } catch {
      acknowledge?.({ ok: false, message: '방을 만들지 못했어요. 다시 시도해 주세요.' });
    }
  });

  socket.on('room:join', (payload: unknown, acknowledge?: (result: unknown) => void) => {
    const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const nickname = normalizeNickname(data.nickname);
    const code = typeof data.code === 'string' ? data.code.replace(/\D/g, '').slice(0, 4) : '';
    const room = rooms.get(code);
    if (!nickname) {
      acknowledge?.({ ok: false, message: '닉네임을 입력해 주세요.' });
      return;
    }
    if (!room) {
      acknowledge?.({ ok: false, message: '방을 찾을 수 없어요. 코드를 다시 확인해 주세요.' });
      return;
    }
    if (room.status !== 'waiting') {
      acknowledge?.({ ok: false, message: '이미 시작한 방이에요. 다음 게임에 참여해 주세요.' });
      return;
    }
    if (room.players.size >= 40) {
      acknowledge?.({ ok: false, message: '이 방은 참가 인원이 가득 찼어요.' });
      return;
    }
    removePlayer(socket);
    room.players.set(socket.id, { id: socket.id, nickname, score: 0, penaltyUntil: 0 });
    socket.join(code);
    socketRoom.set(socket.id, code);
    room.message = `${nickname} 님이 입장했어요.`;
    acknowledge?.({ ok: true, playerId: socket.id, room: snapshot(room) });
    broadcast(room);
  });

  socket.on('room:start', () => {
    const room = roomFor(socket);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit('room:error', '진행자만 게임을 시작할 수 있어요.');
      return;
    }
    if (room.status !== 'waiting') return;
    room.status = 'playing';
    room.roundNumber = 1;
    room.board = createBoard();
    room.message = '첫 라운드 시작! 합을 찾으면 먼저 외쳐요.';
    broadcast(room);
  });

  socket.on('game:claim', () => {
    const room = roomFor(socket);
    if (!room || room.status !== 'playing') return;
    if (room.claimantId) {
      socket.emit('room:message', '이미 다른 참가자가 합을 외쳤어요.');
      return;
    }
    const player = room.players.get(socket.id);
    if (!player) return;
    if (Date.now() < player.penaltyUntil) {
      socket.emit('room:message', `잠시 기다려 주세요. ${Math.ceil((player.penaltyUntil - Date.now()) / 1000)}초 뒤 다시 도전할 수 있어요.`);
      return;
    }
    room.claimantId = socket.id;
    room.claimDeadline = Date.now() + room.claimSeconds * 1000;
    room.message = `${player.nickname} 님이 합을 외쳤어요! 카드를 선택하세요.`;
    room.claimTimer = setTimeout(() => {
      const claimant = room.players.get(socket.id);
      if (room.claimantId !== socket.id || !claimant) return;
      claimant.score -= 1;
      claimant.penaltyUntil = Date.now() + room.penaltySeconds * 1000;
      clearClaim(room);
      room.message = `시간 초과! ${claimant.nickname} 님 −1점`;
      broadcast(room);
    }, room.claimSeconds * 1000);
    broadcast(room);
  });

  socket.on('game:select', (payload: unknown) => {
    const room = roomFor(socket);
    if (!room || room.status !== 'playing' || room.claimantId !== socket.id) return;
    const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const ids = Array.isArray(data.cardIds) ? data.cardIds.filter((id): id is string => typeof id === 'string') : [];
    const player = room.players.get(socket.id);
    if (!player) return;
    if (Date.now() > (room.claimDeadline ?? 0)) return;

    const chosen = ids.map((id) => room.board.find((card) => card.id === id)).filter((card): card is Card => Boolean(card));
    const valid = ids.length === 3 && new Set(ids).size === 3 && chosen.length === 3 && isValidCombination(chosen);
    clearClaim(room);
    if (valid) {
      player.score += 1;
      room.board = replaceCombination(room.board, ids);
      room.message = `정답! ${player.nickname} 님 +1점 · 다음 합을 찾아보세요.`;
    } else {
      player.score -= 1;
      player.penaltyUntil = Date.now() + room.penaltySeconds * 1000;
      room.message = `오답! ${player.nickname} 님 −1점`;
    }
    broadcast(room);
  });

  socket.on('game:declare-none', () => {
    const room = roomFor(socket);
    if (!room || room.status !== 'playing') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    if (room.claimantId) {
      socket.emit('room:message', '카드 선택이 끝난 뒤 결을 선언할 수 있어요.');
      return;
    }
    if (hasAnyCombination(room.board)) {
      player.score -= 1;
      player.penaltyUntil = Date.now() + room.penaltySeconds * 1000;
      room.message = `아직 합이 남아 있어요! ${player.nickname} 님 −1점`;
    } else {
      player.score += 3;
      if (room.roundNumber >= room.roundsTotal) {
        room.status = 'finished';
        room.message = `결! 성공! ${player.nickname} 님 +3점 · 모든 라운드 완료!`;
      } else {
        room.roundNumber += 1;
        room.board = createBoard();
        room.message = `결! 성공! ${player.nickname} 님 +3점 · ${room.roundNumber}라운드 시작!`;
      }
    }
    broadcast(room);
  });

  socket.on('room:leave', () => removePlayer(socket));
  socket.on('disconnect', () => removePlayer(socket));
});

httpServer.listen(PORT, () => {
  console.log(`Gyeolhap server listening on http://localhost:${PORT}`);
});
