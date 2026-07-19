// Golden-master safety net for the per-variant move/replay dispatch. The snapshots in
// replay-golden.json were captured from the PRE-refactor code (regenerated via git stash);
// the dispatch was consolidated onto a VARIANT_RULES table and the resulting board/captures/
// state must be byte-identical. The scenarios are chosen so the dispatch is observable:
//   PLACE    sparse non-capturing moves -> placement + player formula (connect6/go differ)
//   CAP      a pair capture             -> capturing engines differ from gomoku
//   RULE     two rated moves            -> the tournament/g-pente post-move rule (postRule)
//   RREPLAY  replay a 2-move rated game -> disableRatedOnReplay (d-pente / dk-pente)
import { describe, test, expect } from 'vitest';
import golden from './__fixtures__/replay-golden.json';
import { Game } from '../GameClass';

const PLACE = [10, 11, 20, 21, 30, 31, 40];
const CAP = [20, 21, 70, 22, 23];
const TWO = [0, 1];

function snap(g) {
  const occ = g.abstractBoard.flat().map((v, i) => (v ? `${i}:${v}` : null)).filter(Boolean).join(',');
  return `${occ}|cap=${g.captures.join(',')}|until=${g.until}|moves=${g.moves.join(',')}`;
}
function fresh(id, rated) { const g = new Game(); g.setGame(id); g.rated = rated; return g; }

describe('move/replay dispatch — golden master (behaviour preserved across the variantKey refactor)', () => {
  for (let id = 1; id <= 30; id++) {
    test(`game ${id} (placement / capture / rated-rule / replay)`, () => {
      const place = fresh(id, false);
      for (const m of PLACE) place.addMove(m);
      const replay = fresh(id, false);
      replay.moves = [...PLACE];
      replay.replayGame();
      const fromList = fresh(id, false);
      fromList.moves = [...PLACE];
      for (let i = 0; i < PLACE.length; i++) fromList.addMoveFromList(i);
      const cap = fresh(id, false);
      for (const m of CAP) cap.addMove(m);
      const rule = fresh(id, true);
      for (const m of TWO) rule.addMove(m);
      const rreplay = fresh(id, true);
      rreplay.moves = [...TWO];
      rreplay.replayGame();
      expect({
        PLACE: snap(place), REPLAY: snap(replay), FROMLIST: snap(fromList),
        CAP: snap(cap), RULE: snap(rule), RREPLAY: snap(rreplay),
      }).toEqual(golden[id]);
    });
  }
});
