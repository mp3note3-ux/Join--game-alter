import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CardTile } from './components/CardTile';
import {
  allCards,
  createBoard,
  hasAnyCombination,
  isValidCombination,
  replaceCombination,
  type Card,
  type RoomSnapshot,
} from './shared/game';

type Screen = 'home' | 'single' | 'lobby' | 'multi';
type Ack = { ok: boolean; message?: string; room?: RoomSnapshot; playerId?: string };

export function App() {
  const socketRef = useRef<Socket | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [nickname, setNickname] = useState('반짝이');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roundsSetting, setRoundsSetting] = useState(5);
  const [claimSecondsSetting, setClaimSecondsSetting] = useState(10);
  const [penaltySecondsSetting, setPenaltySecondsSetting] = useState(3);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [singleBoard, setSingleBoard] = useState<Card[]>([]);
  const [singleScore, setSingleScore] = useState(0);
  const [singleRound, setSingleRound] = useState(1);
  const [singleRoundsTotal] = useState(3);
  const [singleFinished, setSingleFinished] = useState(false);
  const [singleMessage, setSingleMessage] = useState('카드 세 장을 골라 합을 찾아보세요.');

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.on('room:update', (nextRoom: RoomSnapshot) => setRoom(nextRoom));
    socket.on('room:message', (message: string) => setNotice(message));
    socket.on('room:error', (message: string) => setNotice(message));
    socket.on('connect_error', () => setNotice('서버에 연결하지 못했어요. 서버가 실행 중인지 확인해 주세요.'));
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [room?.claimantId]);

  useEffect(() => {
    if (room?.status === 'playing' || room?.status === 'finished') setScreen('multi');
  }, [room?.status]);

  const sortedPlayers = useMemo(
    () => [...(room?.players ?? [])].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)),
    [room?.players],
  );
  const me = room?.players.find((player) => player.id === myPlayerId);
  const isMyClaim = room?.claimantId === myPlayerId;

  function beginSinglePlayer() {
    setSingleBoard(createBoard());
    setSingleScore(0);
    setSingleRound(1);
    setSingleFinished(false);
    setSelectedIds([]);
    setSingleMessage('카드 세 장을 골라 합을 찾아보세요.');
    setNotice('');
    setScreen('single');
  }

  function selectSingleCard(card: Card) {
    if (singleFinished) return;
    if (selectedIds.includes(card.id)) {
      setSelectedIds(selectedIds.filter((id) => id !== card.id));
      return;
    }
    if (selectedIds.length < 2) {
      setSelectedIds([...selectedIds, card.id]);
      return;
    }
    const ids = [...selectedIds, card.id];
    const chosen = ids.map((id) => singleBoard.find((item) => item.id === id)).filter((item): item is Card => Boolean(item));
    setSelectedIds([]);
    if (isValidCombination(chosen)) {
      setSingleScore((score) => score + 1);
      setSingleBoard((board) => replaceCombination(board, ids));
      setSingleMessage('정답이에요! +1점 · 다음 합을 찾아보세요.');
    } else {
      setSingleScore((score) => score - 1);
      setSingleMessage('아쉽네요. 속성마다 모두 같거나 모두 달라야 해요. −1점');
    }
  }

  function declareSingleNoSet() {
    if (singleFinished) return;
    if (hasAnyCombination(singleBoard)) {
      setSingleScore((score) => score - 1);
      setSingleMessage('아직 합이 남아 있어요. 카드를 더 살펴보세요. −1점');
      return;
    }
    setSingleScore((score) => score + 3);
    if (singleRound >= singleRoundsTotal) {
      setSingleFinished(true);
      setSingleMessage('모든 라운드 완료! 결을 정확히 찾았어요. +3점');
    } else {
      setSingleRound((current) => current + 1);
      setSingleBoard(createBoard());
      setSingleMessage('결! 성공! +3점 · 다음 라운드가 시작됐어요.');
    }
    setSelectedIds([]);
  }

  function createRoom() {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setNotice('게임 서버에 연결 중이거나 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const cleanName = nickname.trim().slice(0, 16);
    if (!cleanName) {
      setNotice('닉네임을 입력해 주세요.');
      return;
    }
    setNotice('방을 만들고 있어요…');
    socket.emit('room:create', {
      nickname: cleanName,
      roundsTotal: roundsSetting,
      claimSeconds: claimSecondsSetting,
      penaltySeconds: penaltySecondsSetting,
    }, (result: Ack) => {
      if (!result.ok || !result.room) {
        setNotice(result.message ?? '방을 만들지 못했어요.');
        return;
      }
      setRoom(result.room);
      setMyPlayerId(result.playerId ?? socket.id ?? '');
      setNotice('방이 만들어졌어요. 코드를 친구들에게 공유해 주세요!');
      setScreen('lobby');
    });
  }

  function joinRoom() {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setNotice('게임 서버에 연결 중이거나 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const cleanName = nickname.trim().slice(0, 16);
    const code = roomCodeInput.replace(/\D/g, '').slice(0, 4);
    if (!cleanName) {
      setNotice('닉네임을 입력해 주세요.');
      return;
    }
    if (code.length !== 4) {
      setNotice('숫자 네 자리 방 코드를 입력해 주세요.');
      return;
    }
    socket.emit('room:join', { nickname: cleanName, code }, (result: Ack) => {
      if (!result.ok || !result.room) {
        setNotice(result.message ?? '방에 입장하지 못했어요.');
        return;
      }
      setRoom(result.room);
      setMyPlayerId(result.playerId ?? socket.id ?? '');
      setNotice('입장했어요. 선생님이 게임을 시작할 때까지 기다려 주세요.');
      setScreen(result.room.status === 'waiting' ? 'lobby' : 'multi');
    });
  }

  function leaveRoom() {
    socketRef.current?.emit('room:leave');
    setRoom(null);
    setMyPlayerId('');
    setSelectedIds([]);
    setScreen('home');
    setNotice('');
  }

  function startRoomGame() {
    socketRef.current?.emit('room:start');
  }

  function claimSet() {
    socketRef.current?.emit('game:claim');
  }

  function selectMultiplayerCard(card: Card) {
    if (!isMyClaim || room?.status !== 'playing') return;
    const next = selectedIds.includes(card.id)
      ? selectedIds.filter((id) => id !== card.id)
      : [...selectedIds, card.id];
    if (next.length === 3) {
      socketRef.current?.emit('game:select', { cardIds: next });
      setSelectedIds([]);
    } else {
      setSelectedIds(next);
    }
  }

  function declareMultiplayerNoSet() {
    socketRef.current?.emit('game:declare-none');
  }

  function copyRoomCode() {
    if (!room) return;
    void navigator.clipboard?.writeText(room.code).then(
      () => setNotice('방 코드를 복사했어요!'),
      () => setNotice(`방 코드: ${room.code}`),
    );
  }

  const sampleCards = allCards().filter((card) =>
    (card.shape === 'circle' && card.shapeColor === 'coral' && card.backgroundColor === 'butter') ||
    (card.shape === 'triangle' && card.shapeColor === 'blue' && card.backgroundColor === 'mint') ||
    (card.shape === 'square' && card.shapeColor === 'violet' && card.backgroundColor === 'lilac'),
  );

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => screen === 'home' ? undefined : leaveRoom()} aria-label="홈으로">
          <span className="brand-mark">✦</span><span>반짝 <b>결! 합!</b></span>
        </button>
        <div className="header-right"><span className="status-dot" /> <span>친구와 함께, 또는 혼자</span></div>
      </header>

      {screen === 'home' && (
        <main className="home-page">
          <section className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><span>✧</span> THINK FAST, FIND A SET</div>
              <h1>같거나 다르게,<br /><em>반짝!</em> 합을 찾아라.</h1>
              <p className="hero-description">모양 · 도형 색 · 배경 색, 세 가지 단서를 조합해요. 먼저 발견한 사람이 승리하는 두뇌 카드 게임!</p>
              <div className="hero-actions">
                <button className="btn btn-primary btn-large" onClick={beginSinglePlayer}>혼자 연습하기 <span>→</span></button>
                <button className="btn btn-secondary btn-large" onClick={() => { setScreen('lobby'); setNotice(''); }}>방 만들기 / 참여하기</button>
              </div>
              <div className="hero-proof"><span className="avatar-stack"><i>🙂</i><i>🤓</i><i>😎</i></span><span>설치 없이 바로 플레이</span><span className="proof-separator">·</span><span>모바일 지원</span></div>
            </div>
            <div className="hero-art" aria-label="서로 다른 세 가지 게임 카드 미리 보기">
              <div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✧</div><div className="sparkle sparkle-three">✦</div>
              <div className="art-label art-label-top">모양</div><div className="art-label art-label-bottom">3가지 속성</div>
              <div className="floating-card card-back card-back-one"><span>✦</span></div>
              <div className="floating-card card-back card-back-two"><span>✧</span></div>
              <div className="art-cards">{sampleCards.map((card, index) => <CardTile key={card.id} card={card} disabled index={index} />)}</div>
              <div className="art-sticker"><span>GOOD<br />MATCH!</span><b>+1</b></div>
            </div>
          </section>

          <section className="mode-section">
            <div className="section-heading"><div><div className="eyebrow">CHOOSE YOUR PLAY</div><h2>어떻게 플레이할까요?</h2></div><p>원하는 방식으로 시작해 보세요.</p></div>
            <div className="mode-grid">
              <button className="mode-card mode-single" onClick={beginSinglePlayer}>
                <span className="mode-icon">🎯</span><span className="mode-tag">SOLO</span><h3>싱글 모드</h3><p>3라운드를 돌며 규칙을 익히고<br />내 최고 점수에 도전해요.</p><span className="mode-link">혼자 시작하기 <b>↗</b></span>
              </button>
              <button className="mode-card mode-host" onClick={() => { setScreen('lobby'); setNotice(''); }}>
                <span className="mode-icon">🧑‍🏫</span><span className="mode-tag">HOST</span><h3>방 만들기</h3><p>선생님이 방을 만들고<br />친구들과 실시간으로 경쟁해요.</p><span className="mode-link">새 방 만들기 <b>↗</b></span>
              </button>
              <button className="mode-card mode-student" onClick={() => { setScreen('lobby'); setNotice(''); }}>
                <span className="mode-icon">🎮</span><span className="mode-tag">JOIN</span><h3>방 참여하기</h3><p>방 코드를 입력하고<br />친구들과 바로 게임을 시작해요.</p><span className="mode-link">코드로 입장하기 <b>↗</b></span>
              </button>
            </div>
          </section>
          <footer className="site-footer"><span>✦</span> 세 가지 속성, 하나의 정답. <span className="footer-right">반짝 결! 합! · 오픈소스 게임</span></footer>
        </main>
      )}

      {screen === 'single' && (
        <main className="game-page">
          <div className="page-topline"><button className="text-button" onClick={() => setScreen('home')}>← 처음으로</button><span className="eyebrow">SOLO PRACTICE</span></div>
          <section className="game-heading"><div><div className="eyebrow">ROUND {singleRound} / {singleRoundsTotal}</div><h1>합을 찾아보세요<span className="title-sparkle">✦</span></h1><p>세 속성이 모두 같거나, 모두 다른 카드 세 장을 선택하세요.</p></div><div className="score-card"><span>내 점수</span><b>{singleScore > 0 ? `+${singleScore}` : singleScore}</b></div></section>
          <div className="round-progress"><span style={{ width: `${(singleRound / singleRoundsTotal) * 100}%` }} /></div>
          {singleFinished ? (
            <section className="finish-panel"><div className="finish-icon">🏆</div><div className="eyebrow">ALL ROUNDS COMPLETE</div><h2>멋져요, 도전 완료!</h2><p>최종 점수는 <b>{singleScore}점</b>이에요.</p><div className="finish-actions"><button className="btn btn-primary" onClick={beginSinglePlayer}>다시 도전하기 ↗</button><button className="btn btn-secondary" onClick={() => setScreen('home')}>홈으로</button></div></section>
          ) : (
            <>
              <div className="game-status"><span className="status-icon">✦</span><span>{singleMessage}</span></div>
              <div className="board-wrap"><div className="board-meta"><span>GAME BOARD</span><span>{singleBoard.length} CARDS</span></div><div className="card-grid">{singleBoard.map((card, index) => <CardTile key={card.id} card={card} index={index} selected={selectedIds.includes(card.id)} onClick={() => selectSingleCard(card)} />)}</div></div>
              <div className="game-controls"><div className="selection-hint"><span className="selection-count">{selectedIds.length}<small>/3</small></span><span>카드를 선택하세요<br /><small>선택한 카드를 다시 누르면 취소돼요.</small></span></div><button className="btn btn-secondary declare-button" onClick={declareSingleNoSet}>결! <span>합이 없어요</span></button></div>
              <RulesStrip />
            </>
          )}
        </main>
      )}

      {screen === 'lobby' && !room && (
        <main className="lobby-page">
          <div className="page-topline"><button className="text-button" onClick={() => { setScreen('home'); setNotice(''); }}>← 처음으로</button><span className="eyebrow">PLAY WITH FRIENDS</span></div>
          <div className="lobby-intro"><div className="eyebrow">ROOM SETUP</div><h1>친구들과 함께<br /><em>결! 합!</em> 해볼까요?</h1><p>선생님은 방을 만들고, 학생은 방 코드로 입장하세요.</p></div>
          <div className="lobby-grid">
            <section className="setup-card host-setup"><div className="setup-icon">🧑‍🏫</div><div className="eyebrow">FOR HOSTS</div><h2>방 만들기</h2><p>라운드와 제한 시간을 설정해요.</p>
              <label className="field-label" htmlFor="host-name">진행자 닉네임</label><input id="host-name" className="text-input" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} placeholder="닉네임" />
              <div className="field-row"><div><label className="field-label" htmlFor="rounds">라운드 수</label><select id="rounds" className="text-input" value={roundsSetting} onChange={(event) => setRoundsSetting(Number(event.target.value))}><option value={3}>3 라운드</option><option value={5}>5 라운드</option><option value={10}>10 라운드</option></select></div><div><label className="field-label" htmlFor="claim-time">선택 제한 시간</label><select id="claim-time" className="text-input" value={claimSecondsSetting} onChange={(event) => setClaimSecondsSetting(Number(event.target.value))}><option value={5}>5초</option><option value={10}>10초</option><option value={15}>15초</option><option value={20}>20초</option></select></div></div>
              <label className="field-label" htmlFor="penalty">오답 대기 시간</label><select id="penalty" className="text-input" value={penaltySecondsSetting} onChange={(event) => setPenaltySecondsSetting(Number(event.target.value))}><option value={0}>없음</option><option value={3}>3초</option><option value={5}>5초</option><option value={10}>10초</option></select>
              <button className="btn btn-primary full-width" onClick={createRoom}>🚀 방 생성하기</button>
            </section>
            <section className="setup-card join-setup"><div className="setup-icon">🎮</div><div className="eyebrow">FOR STUDENTS</div><h2>방 참여하기</h2><p>진행자에게 받은 네 자리 코드를 입력해요.</p>
              <label className="field-label" htmlFor="student-name">내 닉네임</label><input id="student-name" className="text-input" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} placeholder="예: 김지니어스" />
              <label className="field-label" htmlFor="room-code">방 코드</label><input id="room-code" className="text-input room-code-input" inputMode="numeric" autoComplete="one-time-code" value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" maxLength={4} />
              <button className="btn btn-dark full-width" onClick={joinRoom}>입장 완료! <span>→</span></button>
              <div className="join-tip"><span>✦</span> 별도 회원가입 없이 닉네임만으로 입장해요.</div>
            </section>
          </div>
          {notice && <div className="notice-line" role="status">{notice}</div>}
          <RulesStrip />
        </main>
      )}

      {screen === 'lobby' && room && (
        <main className="room-page">
          <div className="page-topline"><button className="text-button" onClick={leaveRoom}>← 나가기</button><span className="eyebrow">MULTIPLAYER ROOM</span></div>
          <section className="room-banner"><div><div className="eyebrow">ROOM CODE · SHARE WITH FRIENDS</div><h1>함께할 준비가 됐나요?</h1><p>친구들은 아래 네 자리 코드로 참여할 수 있어요.</p></div><button className="room-code-card" onClick={copyRoomCode}><span>방 코드</span><b>{room.code}</b><small>코드 복사 ↗</small></button></section>
          <div className="lobby-columns"><section className="players-panel"><div className="panel-heading"><div><div className="eyebrow">PLAYERS</div><h2>참가자 <span>{room.players.length}</span></h2></div><span className="live-pill"><i /> LIVE</span></div><div className="player-list">{room.players.map((player, index) => <div className="player-row" key={player.id}><span className={`player-avatar avatar-${index % 4}`}>{['✦', '☺', '★', '✧'][index % 4]}</span><span className="player-name">{player.nickname}{player.id === myPlayerId && <small>나</small>}</span>{player.isHost && <span className="host-badge">HOST</span>}<b className="player-score">{player.score}점</b></div>)}</div><p className="panel-footnote">실시간 점수판은 게임 중 자동으로 업데이트돼요.</p></section>
            <section className="start-panel"><div className="start-illustration">✦<span>✧</span><b>3</b></div><div className="eyebrow">GAME SETTINGS</div><h2>게임 설정</h2><div className="setting-line"><span>진행 라운드</span><b>{room.roundsTotal} 라운드</b></div><div className="setting-line"><span>선택 제한 시간</span><b>{room.claimSeconds}초</b></div><div className="setting-line"><span>오답 대기 시간</span><b>{room.penaltySeconds}초</b></div>{room.hostId === myPlayerId ? <button className="btn btn-primary full-width" onClick={startRoomGame} disabled={room.players.length === 0}>게임 시작하기 <span>→</span></button> : <div className="waiting-note"><span className="loading-dot" /> 진행자가 게임을 시작할 때까지 기다려 주세요.</div>}</section>
          </div>
          {notice && <div className="notice-line" role="status">{notice}</div>}
        </main>
      )}

      {screen === 'multi' && room && (
        <main className="game-page multiplayer-game">
          <div className="page-topline"><button className="text-button" onClick={leaveRoom}>← 방 나가기</button><span className="eyebrow">ROOM {room.code} · MULTIPLAYER</span></div>
          <section className="game-heading"><div><div className="eyebrow">{room.status === 'finished' ? 'GAME COMPLETE' : `ROUND ${room.roundNumber} / ${room.roundsTotal}`}</div><h1>{room.status === 'finished' ? '오늘의 승자는?' : '합을 찾아 외쳐요'}<span className="title-sparkle">✦</span></h1><p>{room.status === 'finished' ? '모두 수고했어요! 최종 점수를 확인해 보세요.' : '먼저 “합! 외치기”를 누른 뒤, 제한 시간 안에 세 장을 선택하세요.'}</p></div><div className="score-card"><span>내 점수</span><b>{(me?.score ?? 0) > 0 ? `+${me?.score}` : me?.score ?? 0}</b></div></section>
          {room.status === 'finished' ? (
            <section className="finish-panel"><div className="finish-icon">🏆</div><div className="eyebrow">FINAL LEADERBOARD</div><h2>{sortedPlayers[0]?.nickname ?? '플레이어'} 님, 축하해요!</h2><div className="final-ranking">{sortedPlayers.map((player, index) => <div className="final-rank-row" key={player.id}><span>{index + 1}</span><b>{player.nickname}</b><strong>{player.score}점</strong></div>)}</div><button className="btn btn-secondary" onClick={leaveRoom}>홈으로</button></section>
          ) : room.status === 'waiting' ? (
            <div className="game-status">참가자를 기다리고 있어요. 방 코드 <b>{room.code}</b> 를 공유하세요.</div>
          ) : (
            <>
              <div className={`game-status ${room.claimantId ? 'claimed-status' : ''}`}><span className="status-icon">✦</span><span>{room.message}{room.claimantId && room.claimDeadline ? ` · ${Math.max(0, Math.ceil((room.claimDeadline - clock) / 1000))}초 남음` : ''}</span></div>
              <div className="board-wrap"><div className="board-meta"><span>GAME BOARD</span><span>ROOM {room.code}</span></div><div className="card-grid">{room.board.map((card, index) => <CardTile key={card.id} card={card} index={index} selected={selectedIds.includes(card.id)} disabled={!isMyClaim} onClick={() => selectMultiplayerCard(card)} />)}</div></div>
              <div className="game-controls multi-controls"><div className="selection-hint"><span className="selection-count">{isMyClaim ? selectedIds.length : '—'}<small>{isMyClaim ? '/3' : ''}</small></span><span>{isMyClaim ? '세 장을 선택하세요' : room.claimantId ? `${room.players.find((player) => player.id === room.claimantId)?.nickname ?? '참가자'} 님이 선택 중` : '합을 찾았다면 먼저 외쳐요!'}<br /><small>{isMyClaim ? '정답이면 +1점, 오답이면 −1점' : '누구나 “결!”을 선언할 수 있어요.'}</small></span></div><div className="multi-action-buttons">{!room.claimantId ? <button className="btn btn-primary claim-button" onClick={claimSet}>합! 외치기 <span>✦</span></button> : <button className="btn btn-primary claim-button" disabled>{isMyClaim ? `선택 중 ${selectedIds.length}/3` : '상대가 선택 중…'}</button>}<button className="btn btn-secondary declare-button" onClick={declareMultiplayerNoSet}>결!</button></div></div>
              <div className="scoreboard-strip"><div className="eyebrow">LIVE SCORE</div>{sortedPlayers.map((player, index) => <div key={player.id} className={`score-chip ${player.id === myPlayerId ? 'is-me' : ''}`}><span>{index + 1}</span>{player.nickname}<b>{player.score}</b></div>)}</div>
              {notice && <div className="notice-line" role="status">{notice}</div>}
            </>
          )}
          <RulesStrip />
        </main>
      )}
    </div>
  );
}

function RulesStrip() {
  return <section className="rules-strip"><div className="rules-heading"><span>✧</span><div><b>합을 찾는 규칙</b><small>세 가지 속성을 하나씩 확인해요.</small></div></div><div className="rule-item"><span className="rule-symbol same">=</span><div><b>모두 같거나</b><small>세 장의 값이 모두 같아요.</small></div></div><div className="rule-item"><span className="rule-symbol different">≠</span><div><b>모두 다르거나</b><small>세 장의 값이 모두 달라요.</small></div></div><div className="rule-foot">모양 · 도형 색 · 배경 색 모두 조건을 만족해야 해요.</div></section>;
}
