import { useState } from 'react';
import useGame from './useGame';
import useOnlineGame from './useOnlineGame';
import { loadSession, clearSession } from './storage';
import { BASE } from './config';
import { roundLabel, nameOf } from './labels';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './components/Home';
import { JoinPanel, RoomLobby, LocalLobby } from './components/Lobbies';
import Headword from './components/Headword';
import { ChooseWord, WaitForPicker } from './components/Choosing';
import { DefinitionForm, PickerWatch } from './components/Writing';
import Voting from './components/Voting';
import Progress from './components/Progress';
import Timer from './components/Timer';
import Pass from './components/Pass';
import Reveal from './components/Reveal';
import GameOver from './components/GameOver';
import Toasts from './components/Toasts';

const MID_GAME = ['choosing', 'writing', 'voting', 'reveal'];

// ── One device ───────────────────────────────────────────────

function LocalGame({ onBack }) {
  const game = useGame();
  const s = game.state;
  const [readyId, setReadyId] = useState(null); // the player who has taken the phone
  const [shownRound, setShownRound] = useState(0); // the round whose reveal has been put on the table

  // Who needs the phone next: the picker while choosing, then each writer, then each voter.
  const waiting =
    s.phase === 'choosing'
      ? s.players.filter((p) => p.id === s.pickerId)
      : s.phase === 'writing' || s.phase === 'voting'
        ? s.players.filter((p) => p.id !== s.pickerId && !p.done)
        : [];
  const current = waiting[0];
  const holding = current && readyId === current.id;
  const view = holding ? game.viewFor(current.id) : null;
  const others = s.players.filter((p) => p.id !== s.pickerId);
  const label = roundLabel(s);

  const handBack = (res) => {
    if (res?.ok) setReadyId(null); // the next player gets the "pass the phone" screen
    return res;
  };

  const next = () => {
    setReadyId(null);
    game.nextRound();
  };

  const again = () => {
    setShownRound(0);
    setReadyId(null);
    game.playAgain();
  };

  const midGame = MID_GAME.includes(s.phase);
  let passNote = null;
  if (s.phase === 'choosing') passNote = `${current?.name} picks the word. Only they should look.`;
  if (s.phase === 'writing') passNote = `${others.length - waiting.length} of ${others.length} definitions in. Nobody sees them until the vote.`;
  if (s.phase === 'voting') passNote = `${others.length - waiting.length} of ${others.length} votes in.`;

  return (
    <>
      <Header onHome={midGame ? undefined : onBack} onLeave={s.phase === 'lobby' ? undefined : onBack} confirmLeave={midGame} />
      <main className="main">
        {s.phase === 'lobby' && (
          <LocalLobby
            state={s}
            error={game.lobbyError}
            onAdd={game.addPlayer}
            onRemove={game.removePlayer}
            onSetSettings={game.setSettings}
            onStart={game.startGame}
          />
        )}

        {current && !holding && (
          <Pass label={label} name={current.name} note={passNote} word={s.phase === 'choosing' ? null : s.word} onReady={() => setReadyId(current.id)} />
        )}

        {holding && s.phase === 'choosing' && (
          <ChooseWord label={label} offer={view.offer} onChoose={(i) => handBack(game.chooseWord(current.id, i))} />
        )}

        {holding && s.phase === 'writing' && (
          <section className="stack">
            <p className="who"><span className="tag">{current.name}</span> <span className="muted">writing in secret</span></p>
            <Headword word={s.word} />
            <DefinitionForm
              key={current.id}
              word={s.word}
              hints={s.settings.hints}
              onSubmit={(text) => handBack(game.submitDefinition(current.id, text))}
            />
          </section>
        )}

        {holding && s.phase === 'voting' && (
          <section className="stack">
            <p className="who"><span className="tag">{current.name}</span> <span className="muted">voting in secret</span></p>
            <Headword word={s.word} />
            <Voting
              key={current.id}
              ballot={view.ballot}
              myEntry={view.myEntry}
              myVote={view.myVote}
              canVote
              onVote={(entryId) => handBack(game.castVote(current.id, entryId))}
            />
          </section>
        )}

        {s.phase === 'reveal' && shownRound !== s.round && (
          <section className="stack stack--loose center pass">
            <span className="tag tag--plain">{label}</span>
            <Headword word={s.word} as="p" size="small" />
            <div className="stack">
              <h1 className="pass__name">Every vote is in</h1>
              <p className="muted">Put the phone where everyone can see it, then reveal.</p>
            </div>
            <button className="btn btn--block" type="button" onClick={() => setShownRound(s.round)}>Reveal the answer</button>
          </section>
        )}

        {s.phase === 'reveal' && shownRound === s.round && (
          <Reveal
            state={s}
            action={
              <button className="btn btn--block" type="button" onClick={next}>
                {s.final ? 'See final scores' : 'Next word'}
              </button>
            }
          />
        )}

        {s.phase === 'gameOver' && <GameOver state={s} onPlayAgain={again} onLeave={onBack} leaveLabel="Back to the start" />}
      </main>
      <Footer />
    </>
  );
}

// ── Online ───────────────────────────────────────────────────

function HostButton({ children, onClick, disabled, note }) {
  return (
    <div className="stack stack--tight host-tools">
      <button className="btn btn--ghost btn--block" type="button" onClick={onClick} disabled={disabled}>{children}</button>
      {note && <p className="muted small center">{note}</p>}
    </div>
  );
}

function OnlineGame({ onBack, initialCode }) {
  const game = useOnlineGame();
  const s = game.state;
  const me = game.myPlayerId;

  const leave = () => {
    game.leaveRoom();
    onBack();
  };

  const midGame = s && MID_GAME.includes(s.phase);
  const hostName = s ? nameOf(s, s.hostId) : '';
  const isPicker = !!s && s.pickerId === me;
  const picker = s?.players.find((p) => p.id === s.pickerId);
  const done = s ? s.players.filter((p) => p.id !== s.pickerId && p.done).length : 0;
  const label = s && midGame ? roundLabel(s) : '';

  return (
    <>
      <Header
        onHome={s ? undefined : onBack}
        code={s?.code}
        connectionStatus={game.connectionStatus}
        onLeave={s ? leave : undefined}
        confirmLeave={midGame}
      />
      {s && game.connectionStatus !== 'connected' && (
        <p className="banner" role="status">Reconnecting. Your seat is saved.</p>
      )}
      <main className="main">
        {!s && game.resuming && <p className="muted center" role="status">Taking your seat back</p>}

        {!s && !game.resuming && (
          <JoinPanel
            initialCode={initialCode}
            error={game.error}
            onClearError={game.clearError}
            onCreate={game.createRoom}
            onJoin={game.joinRoom}
          />
        )}

        {s?.phase === 'lobby' && (
          <RoomLobby
            state={s}
            myId={me}
            isHost={game.isHost}
            error={game.error}
            onSetSettings={game.setSettings}
            onStart={game.startGame}
          />
        )}

        {s?.phase === 'choosing' &&
          (isPicker && s.offer ? (
            <ChooseWord label={label} offer={s.offer} onChoose={game.chooseWord} />
          ) : (
            <WaitForPicker
              label={label}
              pickerName={picker?.name ?? 'Someone'}
              pickerOffline={!!picker && !picker.connected}
              isHost={game.isHost}
              onPickFor={game.pickForPicker}
            />
          ))}

        {(s?.phase === 'writing' || s?.phase === 'voting') && (
          <section className="stack stack--loose">
            <div className="stack stack--tight">
              <div className="phase-head">
                <span className="tag tag--plain">{label}</span>
                <Timer key={game.deadline} deadline={game.deadline} label={s.phase === 'writing' ? 'Writing' : 'Voting'} />
              </div>
              <Headword word={s.word} />
            </div>

            {s.phase === 'writing' &&
              (isPicker ? (
                <PickerWatch answer={s.answer} />
              ) : (
                <DefinitionForm key={s.round} word={s.word} hints={s.settings.hints} lockedText={s.mine?.text ?? null} onSubmit={game.submitDefinition} />
              ))}

            {s.phase === 'voting' && (
              <Voting key={s.round} ballot={s.ballot} myEntry={s.myEntry} myVote={s.myVote} canVote={!isPicker} onVote={game.castVote} />
            )}

            <Progress state={s} myId={me} verb={s.phase === 'writing' ? 'definitions in' : 'votes in'} />

            {game.isHost && s.phase === 'writing' && (
              <HostButton onClick={game.endWriting} disabled={done === 0} note={done === 0 ? 'Available once someone has written a definition.' : null}>
                End writing now
              </HostButton>
            )}
            {game.isHost && s.phase === 'voting' && (
              <HostButton onClick={game.endVoting} disabled={done === 0} note={done === 0 ? 'Available once someone has voted.' : null}>
                End voting now
              </HostButton>
            )}
            <p className="notice center" role="alert">{game.error}</p>
          </section>
        )}

        {s?.phase === 'reveal' && (
          <Reveal
            state={s}
            myId={me}
            action={
              game.isHost ? (
                <button className="btn btn--block" type="button" onClick={game.nextRound}>
                  {s.final ? 'See final scores' : 'Next word'}
                </button>
              ) : (
                <p className="muted center">Waiting for {hostName} to continue.</p>
              )
            }
          />
        )}

        {s?.phase === 'gameOver' && (
          <GameOver
            state={s}
            myId={me}
            onPlayAgain={game.isHost ? game.resetGame : null}
            waitingFor={hostName}
            onLeave={leave}
          />
        )}
      </main>
      <Footer />
      <Toasts toasts={game.toasts} />
    </>
  );
}

// ── Where to start ───────────────────────────────────────────

// An invite link wins. Then a saved online seat. Then the home screen.
function initialState() {
  const room = (new URLSearchParams(window.location.search).get('room') || '').trim().toUpperCase().slice(0, 8);
  const saved = loadSession();
  if (room) {
    if (saved && saved.code !== room) clearSession(); // an invite to a different room means a fresh join
    return { room, mode: 'online' };
  }
  return { room: '', mode: saved ? 'online' : null };
}

export default function App() {
  const [initial] = useState(initialState);
  const [mode, setMode] = useState(initial.mode); // null | 'local' | 'online'

  const home = () => {
    // Drop ?room=CODE so a reload after leaving does not walk back into the invite.
    if (window.location.search) window.history.replaceState(null, '', BASE);
    setMode(null);
  };

  return (
    <div className="app">
      {mode === null && (
        <>
          <Header />
          <main className="main">
            <Home onSelectMode={setMode} />
          </main>
          <Footer />
        </>
      )}
      {mode === 'local' && <LocalGame onBack={home} />}
      {mode === 'online' && <OnlineGame onBack={home} initialCode={initial.room} />}
    </div>
  );
}
