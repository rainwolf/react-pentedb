// Threat-analysis engine — pure JS port of the desktop Java (org.pente.tree).
//
// PORT AUTHORITY: docs/superpowers/plans/research/pentedb/threat-engine-port.md, cross-checked
// line-by-line against the desktop source at
//   pente.org/dsg_src/java/org/pente/tree/{Threat,Line,Rank,PositionAnalysis,PenteAnalyzer}.java
//   pente.org/dsg_src/java/org/pente/game/SimplePenteState.java   (isValidPosition)
//
// This is a FAITHFUL reproduction: every "quirk to preserve" (port-doc §13) is kept and NO
// latent bug is fixed. Despite the package name `tree`, there is NO search tree — it is pure
// static pattern matching on a 1-D line buffer. Pure module: no React/redux/api imports.
//
// Entry point: analyzePosition({game, moves, boardW=19, boardH=19}) (see bottom).

import {
  TYPE_BLOCKED,
  TYPE_POTENTIAL_CAPTURE,
  TYPE_POTENTIAL_THREE_PAIR,
  TYPE_POTENTIAL_FOUR,
  TYPE_TRIA,
  TYPE_CLOSED_FOUR,
  TYPE_OPEN_FOUR,
  TYPE_POTENTIAL_THREE_SPLIT,
  WALL,
  RANKS_OFFENSE,
  RANKS_DEFENSE,
  TYPE_PRIOR,
} from './threatConstants';

// ---------------------------------------------------------------------------------------
// BoardState — implements the required board API (port-doc §1.1) over {game, moves, W, H}.
// The threat engine does NOT replay captures; it relies on game.getPosition already
// reflecting them (port-doc §9.1). `game` need only duck-type getPosition(pos) + captures[].
// ---------------------------------------------------------------------------------------
class BoardState {
  constructor(game, moves, boardW, boardH) {
    this.game = game;
    this.moves = moves || [];
    this.W = boardW;
    this.H = boardH;
  }

  getGridSizeX() {
    return this.W;
  }

  getGridSizeY() {
    return this.H;
  }

  getNumMoves() {
    return this.moves.length;
  }

  getMove(i) {
    return this.moves[i];
  }

  getPosition(pos) {
    const v = this.game.getPosition(pos);
    return v == null ? 0 : v;
  }

  // AMBIGUITY #1 (port-doc §14) resolved: GameClass/winCheck store `captures[colourRemoved]`
  // = stones of that colour removed from the board (even; a Pente win = 10 removed = 5 pairs).
  // The Java engine's getNumCaptures(player) is the count of stones PLAYER captured = opponent
  // stones removed = captures[3 - player]. Units are stones, so analyzeCaptures's `+= 2` /
  // `> 8` arithmetic is exactly "reaches >= 10 removed stones".
  getNumCaptures(player) {
    const caps = this.game.captures;
    if (!caps) return 0;
    return caps[3 - player] || 0;
  }

  // AMBIGUITY #2 (port-doc §14) resolved: ported VERBATIM from SimplePenteState.isValidPosition.
  // The 2nd arg is a no-wrap ANCHOR, not a step-by-step adjacency check: only opposite-edge
  // columns (col 0 vs col W-1) are rejected. This is why findCaps (quirk #2) can validate cells
  // 2-3 steps away against the origin `move`. Matching this exactly is what makes edge behaviour
  // correct.
  isValidPosition(newPosition, oldPosition) {
    const x = this.W;
    const oldX = oldPosition % x;
    const newX = newPosition % x;
    const maxMove = x * this.H - 1;
    // if it passes over a side edge
    if ((oldX === 0 && newX === x - 1) || (oldX === x - 1 && newX === 0)) {
      return false;
    }
    // if it goes over the top or bottom
    if (newPosition < 0 || newPosition > maxMove) {
      return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------------------
// Threat (Threat.java). moves[] kept sorted-ascending & deduped (required by equals/isSimilar).
// ---------------------------------------------------------------------------------------
class Threat {
  constructor() {
    this.moves = new Array(20).fill(0);
    this.numMoves = 0;
    this.threatMove = 0; // for potential captures
    this.captureMove = 0; // for potential captures
    this.resps = []; // defensive squares (opponent neutralises)
    this.next = []; // offensive squares (owner advances)
    this.player = 0;
    this.type = 0;
    this.movesToWin = 0;
    this.blockedMovesToWin = 0;
    this.blocked = false;
    this.typeSinceBlocked = 0;
    this.numBlocks = 0;
    this.blockPositions = new Array(5).fill(0);
  }

  addMove(move) {
    // insertion sort; return silently if already present (dedup)
    let i = 0;
    for (i = 0; i < this.numMoves; i++) {
      if (move === this.moves[i]) return;
      else if (move < this.moves[i]) break;
    }
    for (let j = this.numMoves; j > i; j--) {
      this.moves[j] = this.moves[j - 1];
    }
    this.moves[i] = move;
    this.numMoves++;
  }

  getEnds() {
    let min = 370;
    let max = -1;
    for (let i = 0; i < this.numMoves; i++) {
      if (this.moves[i] < min) min = this.moves[i];
      if (this.moves[i] > max) max = this.moves[i];
    }
    return [min, max];
  }

  addResp(move) {
    if (!this.resps.includes(move)) this.resps.push(move);
  }

  insertNext(move, index) {
    if (!this.next.includes(move)) this.next.splice(index, 0, move);
  }

  addNext(move) {
    if (!this.next.includes(move)) this.next.push(move);
  }

  addBlock(move) {
    this.blocked = true;
    this.blockPositions[this.numBlocks++] = move;
  }

  // 0 = not similar, 1 = this is bigger & contains all of t, 2 = this is smaller & contained by t.
  // QUIRK #1 (port-doc §13): returns 0 for equal-size sets even when identical (identity is
  // handled by equals in addThreat). Relies on both moves[] sorted ascending.
  isSimilar(t) {
    if (t.numMoves === this.numMoves) {
      return 0;
    }
    if (t.numMoves > this.numMoves) {
      let j = 0;
      for (let i = 0; i < t.numMoves; i++) {
        if (t.moves[i] === this.moves[j]) j++;
      }
      if (j === this.numMoves) return 2;
    } else {
      let j = 0;
      for (let i = 0; i < this.numMoves; i++) {
        if (this.moves[i] === t.moves[j]) j++;
      }
      if (j === t.numMoves) return 1;
    }
    return 0;
  }

  equals(t) {
    if (t === this) return true;
    if (t.numMoves !== this.numMoves) return false;
    for (let i = 0; i < this.numMoves; i++) {
      if (t.moves[i] !== this.moves[i]) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------------------
// Line (Line.java). A normalized 1-D window centered on a maximal run of player p's stones.
//   moves[i]    = colour at slot: 0 empty, p own, op opponent, 4 WALL
//   positions[i]= board position (0 when WALL)
//   slots 0,1 = left pads; len-2,len-1 = right pads; core = 2..len-3
//   thirdOuter*[0]=left 3rd cell, [1]=right 3rd cell
// ---------------------------------------------------------------------------------------
class Line {
  constructor() {
    this.orientation = 0;
    this.len = 0;
    this.myLen = 0;
    this.gaps = 0;
    this.p = 0;
    this.op = 0;
    this.positions = new Array(20).fill(0);
    this.moves = new Array(20).fill(0);
    this.move = 0;
    this.thirdOuterMoves = new Array(2).fill(0);
    this.thirdOuterPositions = new Array(2).fill(0);
    this.groups = new Array(3).fill(0);
    this.numGroups = 0;
  }

  // clone(): deep-copies moves/positions/thirdOuter*. Mirrors Java super.clone() semantics —
  // scalar fields (len/myLen/gaps/orientation/p/op/move/numGroups) are copied by value and
  // `groups` by value (Java shares the ref, but groups is read-only after split()'s initial
  // scan, so a value copy is behaviourally identical).
  clone() {
    const l = new Line();
    l.orientation = this.orientation;
    l.len = this.len;
    l.myLen = this.myLen;
    l.gaps = this.gaps;
    l.p = this.p;
    l.op = this.op;
    l.move = this.move;
    l.numGroups = this.numGroups;
    // Java only copies moves/positions up to `len`, but the split() shift loops read up to
    // index 19, so copy the whole 20-slot buffer (indices >= len are 0, matching a fresh
    // array — equivalent to Java where those slots were never written).
    for (let i = 0; i < this.len; i++) {
      l.moves[i] = this.moves[i];
      l.positions[i] = this.positions[i];
    }
    l.thirdOuterMoves[0] = this.thirdOuterMoves[0];
    l.thirdOuterMoves[1] = this.thirdOuterMoves[1];
    l.thirdOuterPositions[0] = this.thirdOuterPositions[0];
    l.thirdOuterPositions[1] = this.thirdOuterPositions[1];
    l.groups[0] = this.groups[0];
    l.groups[1] = this.groups[1];
    l.groups[2] = this.groups[2];
    return l;
  }

  // findThreat() — the pattern classifier (Line.java findThreat). Returns an array of Threats
  // (usually 1) or null when no threat. Ported branch-for-branch; "junit check" comments in the
  // Java mark each documented case.
  findThreat() {
    const p = this.p;
    const op = 3 - p;
    this.op = op;
    const len = this.len;
    const moves = this.moves;
    const positions = this.positions;

    const threats = [];

    const t = new Threat();
    t.movesToWin = 10;
    t.player = p;
    // §6.0 standard prelude: core own stones -> moves; every internal gap -> next AND resp.
    for (let i = 2; i < len - 2; i++) {
      if (moves[i] === p) {
        t.addMove(positions[i]);
      } else if (moves[i] === 0) {
        t.addResp(positions[i]);
        t.addNext(positions[i]);
      }
    }

    if (this.myLen === 1) {
      return null;
    } else if (this.myLen === 2) {
      if (len === 6) {
        // **XX**
        if (moves[1] === WALL || moves[len - 2] === WALL) {
          return null;
        } else if (moves[1] === op && moves[len - 2] === op) {
          // ?OXXO? dead pair (fires even with an outer own stone — see XOXXO)
          return null;
        } else if (moves[1] === op) {
          // ?OXX?? left blocked. _XOXX or XXOXX (not 0XOXX)
          if (moves[0] === p && (this.thirdOuterMoves[0] === p || this.thirdOuterMoves[0] === 0)) {
            const t2 = new Threat();
            t2.player = p;
            t2.type = TYPE_BLOCKED;
            t2.movesToWin = 10;
            t2.blockedMovesToWin = 3;
            t2.addBlock(positions[1]);
            t2.addMove(positions[0]);
            t2.addMove(positions[2]);
            t2.addMove(positions[3]);
            if (this.thirdOuterMoves[0] === p) {
              // XXOXX
              t2.blockedMovesToWin = 1;
              t2.addMove(this.thirdOuterPositions[0]);
            }
            threats.push(t2);
            return threats;
          } else {
            return null;
          }
        } else if (moves[len - 2] === op) {
          // ??XXO? right blocked (mirror)
          if (
            moves[len - 1] === p &&
            (this.thirdOuterMoves[1] === p || this.thirdOuterMoves[1] === 0)
          ) {
            const t2 = new Threat();
            t2.player = p;
            t2.type = TYPE_BLOCKED;
            t2.movesToWin = 10;
            t2.blockedMovesToWin = 3;
            t2.addBlock(positions[len - 2]);
            t2.addMove(positions[len - 1]);
            t2.addMove(positions[len - 3]);
            t2.addMove(positions[len - 4]);
            if (this.thirdOuterMoves[1] === p) {
              t2.blockedMovesToWin = 1;
              t2.addMove(this.thirdOuterPositions[1]);
            }
            threats.push(t2);
            return threats;
          } else {
            return null;
          }
        } else if (
          (moves[0] === op || moves[0] === WALL) &&
          (moves[len - 1] === op || moves[len - 1] === WALL)
        ) {
          // O_XX_O
          return null;
        } else {
          // ?_XX_? open pair
          t.type = TYPE_POTENTIAL_THREE_PAIR;
          t.movesToWin = 5;
          t.addNext(positions[1]);
          t.addResp(positions[1]);
          t.addNext(positions[len - 2]);
          t.addResp(positions[len - 2]);
          if (moves[0] !== op && moves[0] !== WALL) {
            t.addNext(positions[0]);
          }
          if (moves[len - 1] !== op && moves[len - 1] !== WALL) {
            t.addNext(positions[len - 1]);
          }
        }
      } else {
        // gapped pair X_X / X__X. 0X_X or 0X__X intentionally ignored.
        if (
          moves[1] === op ||
          moves[len - 2] === op ||
          moves[1] === WALL ||
          moves[len - 2] === WALL
        ) {
          return null;
        }
        t.type = TYPE_POTENTIAL_THREE_SPLIT;
        t.movesToWin = 5;
        t.addNext(positions[1]);
        t.addResp(positions[1]);
        t.addNext(positions[len - 2]);
        t.addResp(positions[len - 2]);
        if (this.gaps === 1 && moves[0] !== op) {
          t.addNext(positions[0]); // make a X_X_X
        }
        if (this.gaps === 1 && moves[len - 1] !== op) {
          t.addNext(positions[len - 1]); // make a X_X_X
        }
      }
    } else if (this.myLen === 3 && len === 9 && this.gaps === 2) {
      // (A) ?X_X_X? / ?X__XX?
      t.type = TYPE_POTENTIAL_FOUR;
      t.movesToWin = 3;
    } else if (this.myLen === 3 && len === 7 && this.gaps === 0 && moves[len - 2] === op && moves[1] === op) {
      // (B) ?OXXXO? both-blocked
      t.typeSinceBlocked = TYPE_TRIA;
      t.blockedMovesToWin = 1;
      t.movesToWin = 0;
      if (moves[0] === p) {
        t.type = TYPE_BLOCKED;
        t.addBlock(positions[1]);
        t.addMove(positions[0]);
      } else if (moves[len - 1] === p) {
        t.type = TYPE_BLOCKED;
        t.addBlock(positions[len - 2]);
        t.addMove(positions[len - 1]);
      } else {
        return null;
      }
    } else if (this.myLen === 3 && len === 7 && this.gaps === 0 && moves[1] === op && moves[len - 2] === 0) {
      // (C) ?OXXX_?
      if (moves[len - 1] === 0) {
        // ?OXXX__
        t.type = TYPE_POTENTIAL_FOUR;
        t.movesToWin = 3;
        t.addNext(positions[len - 2]);
        t.addResp(positions[len - 2]);
        t.addNext(positions[len - 1]);
        t.addResp(positions[len - 1]);
      } else {
        // ?OXXX_O
        t.movesToWin = 0; // no direct way to win
        t.type = TYPE_BLOCKED;
      }
      if (moves[0] === p) {
        // XOXXX_*
        t.typeSinceBlocked = TYPE_TRIA;
        t.blockedMovesToWin = 1;
        t.addMove(positions[0]);
      } else {
        // _OXXX_*
        t.typeSinceBlocked = TYPE_POTENTIAL_THREE_SPLIT;
        t.blockedMovesToWin = 3;
      }
      t.addBlock(positions[1]);
    } else if (this.myLen === 3 && len === 7 && this.gaps === 0 && moves[len - 2] === op && moves[1] === 0) {
      // (D) ?_XXXO? (mirror of C)
      if (moves[0] === 0) {
        // __XXXO?
        t.type = TYPE_POTENTIAL_FOUR;
        t.movesToWin = 3;
        t.addNext(positions[1]);
        t.addResp(positions[1]);
        t.addNext(positions[0]);
        t.addResp(positions[0]);
      } else {
        // 0_XXXO?
        t.movesToWin = 0;
        t.type = TYPE_BLOCKED;
      }
      if (moves[len - 1] === p) {
        // *_XXX0X
        t.typeSinceBlocked = TYPE_TRIA;
        t.blockedMovesToWin = 1;
        t.addMove(positions[len - 1]);
      } else {
        t.typeSinceBlocked = TYPE_POTENTIAL_THREE_SPLIT;
        t.blockedMovesToWin = 3;
      }
      t.addBlock(positions[len - 2]);
    } else if (
      this.myLen === 3 &&
      this.gaps === 1 &&
      ((moves[1] === op && moves[len - 2] === 0) || (moves[1] === 0 && moves[len - 2] === op))
    ) {
      // (E) gapped three blocked on one immediate side
      t.type = TYPE_POTENTIAL_FOUR;
      t.typeSinceBlocked = TYPE_POTENTIAL_THREE_SPLIT;
      t.movesToWin = 3;
      t.blockedMovesToWin = 3;
      if (moves[1] === 0) {
        t.addNext(positions[1]);
        t.addResp(positions[1]);
        t.addBlock(positions[len - 2]);
      } else {
        t.addNext(positions[len - 2]);
        t.addResp(positions[len - 2]);
        t.addBlock(positions[1]);
      }
    } else if (this.myLen === 3 && this.gaps < 2 && moves[1] === 0 && moves[len - 2] === 0) {
      // (F) open/half-open threes ?_XXX_? / _X_XX_
      if (
        this.gaps === 0 &&
        (moves[0] === op || moves[0] === WALL) &&
        (moves[len - 1] === op || moves[len - 1] === WALL)
      ) {
        // O_XXX_O
        t.type = TYPE_POTENTIAL_FOUR;
        t.movesToWin = 3;
        t.addNext(positions[1]);
        t.addNext(positions[len - 2]);
        t.addResp(positions[1]);
        t.addResp(positions[len - 2]);
      } else {
        t.type = TYPE_TRIA;
        t.movesToWin = 3;
        if (this.gaps === 0) {
          // 0_XXX__
          if (moves[0] === op || moves[0] === WALL) {
            t.addResp(positions[len - 1]);
          } else {
            // 12XXX3?
            t.addNext(positions[1]);
            t.addNext(positions[0]);
            t.addNext(positions[len - 2]);
            t.addResp(positions[1]);
            t.addResp(positions[0]);
            t.addResp(positions[len - 2]);
          }
          // __XXX_0
          if (moves[len - 1] === op || moves[len - 1] === WALL) {
            t.addResp(positions[0]);
          } else {
            // ?3XXX12
            t.addNext(positions[len - 2]);
            t.addNext(positions[len - 1]);
            t.addNext(positions[1]);
            t.addResp(positions[len - 2]);
            t.addResp(positions[len - 1]);
            t.addResp(positions[1]);
          }
        } else {
          // __X_XX__ respond next to it
          t.addNext(positions[1]);
          t.addResp(positions[1]);
          t.addNext(positions[len - 2]);
          t.addResp(positions[len - 2]);
        }
      }
    } else if (this.myLen >= 4) {
      // 0XXXX0 — blocked both immediate sides
      if (
        this.gaps === 0 &&
        (moves[1] === op || moves[1] === WALL) &&
        (moves[len - 2] === op || moves[len - 2] === WALL)
      ) {
        t.type = TYPE_BLOCKED;
        t.typeSinceBlocked = TYPE_TRIA;
        t.blockedMovesToWin = 1;
        t.addBlock(positions[1]);
        t.addBlock(positions[len - 2]);
        threats.push(t);
        return threats;
      }
      // solid four inside a longer run — walk groups
      let l = 0;
      for (let i = 0; i < this.numGroups; i++) {
        if (this.groups[i] === 4) {
          t.next.length = 0; // clear()
          t.resps.length = 0;
          t.movesToWin = 1;
          if (moves[l + 1] === 0 && moves[l + 6] === 0) {
            t.type = TYPE_OPEN_FOUR;
            t.addNext(positions[l + 1]);
            t.addNext(positions[l + 6]);
            t.addResp(positions[l + 1]);
            t.addResp(positions[l + 6]);
          } else if (moves[l + 1] === 0) {
            t.type = TYPE_CLOSED_FOUR;
            t.addNext(positions[l + 1]);
            t.addResp(positions[l + 1]);
          } else {
            // moves[l+6]==0
            t.type = TYPE_CLOSED_FOUR;
            t.addNext(positions[l + 6]);
            t.addResp(positions[l + 6]);
          }
          threats.push(t);
          return threats;
        }
        l += this.groups[i] + 1;
      }
      // XX__XX
      if (this.gaps === 2 && this.numGroups === 3 && this.groups[1] === 0) {
        t.type = TYPE_POTENTIAL_FOUR;
        t.movesToWin = 3;
        if (moves[1] === 0) {
          t.addNext(positions[1]);
          t.addResp(positions[1]);
        }
        if (moves[len - 2] === 0) {
          t.addNext(positions[len - 2]);
          t.addResp(positions[len - 2]);
        }
        threats.push(t);
        return threats;
      }
      // gapped four, e.g. X_XXX / XX_XX
      if (this.gaps === 0 && moves[1] === 0 && moves[len - 2] === 0) {
        t.type = TYPE_OPEN_FOUR;
      } else {
        t.type = TYPE_CLOSED_FOUR;
      }
      t.movesToWin = 1;
      if (this.gaps === 0) {
        if (moves[1] !== op && moves[1] !== WALL) {
          t.addNext(positions[1]);
          t.addResp(positions[1]);
        }
        if (moves[len - 2] !== op && moves[len - 2] !== WALL) {
          t.addNext(positions[len - 2]);
          t.addResp(positions[len - 2]);
        }
      }
    } else {
      return null;
    }

    threats.push(t);
    return threats;
  }

  // split() — decompose runs with >=3 groups (>=2 internal gaps) into simpler sub-lines.
  // Returns an array of Lines (this unchanged when nothing splits). QUIRK #3 (port-doc §13):
  // rules 2-5 are NOT mutually exclusive — one line can emit both a left-4 and a right-3
  // sub-line. The `groups[i]==4` loop is a dead TODO stub (do nothing) and is preserved.
  split() {
    // scan groups (VERBATIM). groups[k] = size of k-th own run; numGroups = gaps+1.
    for (let i = 2; i < this.len - 2; i++) {
      if (this.moves[i] === this.p) this.groups[this.numGroups]++;
      else if (this.moves[i] === 0) this.numGroups++;
    }
    this.numGroups++;

    const lines = [];

    if (this.numGroups < 3) {
      lines.push(this);
      return lines;
    }

    // dead TODO stub — preserved as a no-op (QUIRK #5)
    for (let i = 0; i < this.numGroups; i++) {
      if (this.groups[i] === 4) {
        // create just a threat using one group  (empty)
      }
    }

    let split = false;

    // XX_XX_***, cut out the ***
    if (this.groups[1] !== 0 && this.groups[0] + this.groups[1] === 4) {
      split = true;
      const l = this.clone();
      l.len = 9;
      l.myLen = 4;
      l.gaps = 1;
      l.thirdOuterMoves[1] = l.moves[10];
      l.thirdOuterPositions[1] = l.positions[10];
      lines.push(l);
    }
    // ***_X_XXX, cut out the ***
    if (this.groups[1] !== 0 && this.groups[1] + this.groups[2] === 4) {
      split = true;
      const l = this.clone();
      const d = l.len - 9;
      // shift moves to the left
      for (let i = 0; i < 20 - d; i++) {
        l.moves[i] = l.moves[i + d];
        l.positions[i] = l.positions[i + d];
      }
      l.thirdOuterMoves[1] = l.moves[10];
      l.thirdOuterPositions[1] = l.positions[10];
      l.len = 9;
      l.myLen = 4;
      l.gaps = 1;
      lines.push(l);
    }

    if (this.groups[0] + this.groups[1] === 3) {
      split = true;
      const l = this.clone();
      if (this.groups[1] === 0) {
        // just _XXX_
        l.len = 7;
        l.gaps = 0;
      } else {
        // _X_XX or XX_X
        l.len = 8;
        l.gaps = 1;
      }
      l.thirdOuterMoves[1] = l.moves[l.len + 1];
      l.thirdOuterPositions[1] = l.positions[l.len + 1];
      l.myLen = 3;
      lines.push(l);
    }
    if (this.groups[1] + this.groups[2] === 3) {
      split = true;
      const l = this.clone();
      if (this.groups[1] === 0) {
        // just _XXX_
        l.len = 7;
        l.gaps = 0;
        const d = this.len - 7;
        for (let i = 0; i < 20 - d; i++) {
          l.moves[i] = l.moves[i + d];
          l.positions[i] = l.positions[i + d];
        }
      } else {
        // _X_XX or XX_X
        l.len = 8;
        l.gaps = 1;
        const d = this.len - 8;
        for (let i = 0; i < 20 - d; i++) {
          l.moves[i] = l.moves[i + d];
          l.positions[i] = l.positions[i + d];
        }
      }
      l.thirdOuterMoves[1] = l.moves[l.len + 1];
      l.thirdOuterPositions[1] = l.positions[l.len + 1];
      l.myLen = 3;
      lines.push(l);
    }

    if (!split) {
      lines.push(this);
    }

    return lines;
  }
}

// ---------------------------------------------------------------------------------------
// Rank (Rank.java). Per-square accumulator. group defaults to 100 ("bad default"); lower
// group = more urgent. getGroup() = min(offenseGroup, defenseGroup); getRank() = sum.
// ---------------------------------------------------------------------------------------
class Rank {
  constructor(move) {
    this.move = move;
    this.offenseRank = 0;
    this.defenseRank = 0;
    this.offenseGroup = 100;
    this.defenseGroup = 100;
  }

  addOffenseRank(rank) {
    this.offenseRank += rank;
  }

  addDefenseRank(rank) {
    this.defenseRank += rank;
  }

  getRank() {
    return this.offenseRank + this.defenseRank;
  }

  setOffenseGroup(group) {
    this.offenseGroup = group;
  }

  getOffenseGroup() {
    return this.offenseGroup;
  }

  getDefenseGroup() {
    return this.defenseGroup;
  }

  setDefenseGroup(group) {
    this.defenseGroup = group;
  }

  getGroup() {
    return this.offenseGroup < this.defenseGroup ? this.offenseGroup : this.defenseGroup;
  }
}

// ---------------------------------------------------------------------------------------
// PositionAnalysis (PositionAnalysis.java). threats[1..2]/pairs[1..2] as insertion-ordered
// arrays (JS arrays give deterministic order; Java used HashSet — port-doc AMBIGUITY #4 notes
// results are order-independent given the containment logic). caps indexed by player.
// The dead code (findMaxCaps, maxCaps, GROUPS_*) is intentionally NOT ported (QUIRK #5).
// ---------------------------------------------------------------------------------------
class PositionAnalysis {
  constructor(caps, boardSize) {
    this.move = 0;
    this.player = 0;
    this.caps = caps;
    this.boardSize = boardSize; // = W*H + 1 (port rule; replaces hard-coded 362)
    this.threats = [null, [], []];
    this.pairs = [null, [], []];
  }

  // addThreat — keep only maximal, distinct threats (collapses overlapping scans).
  addThreat(t) {
    const set = this.threats[t.player];
    for (let i = 0; i < set.length; i++) {
      const e = set[i];
      if (e.equals(t)) return; // exact duplicate
      const sim = e.isSimilar(t);
      if (sim === 1) {
        return; // existing e already contains t -> drop t
      } else if (sim === 2) {
        set.splice(i, 1); // t contains e -> replace e with t
        break;
      }
    }
    set.push(t);
  }

  // addPair — Java HashSet dedups identical pairs by equals; replicate with an equals check.
  addPair(t) {
    const set = this.pairs[t.player];
    for (let i = 0; i < set.length; i++) {
      if (set[i].equals(t)) return;
    }
    set.push(t);
  }

  getNumThreats(player) {
    return this.threats[player].length;
  }

  // analyzeCaptures — cross-reference captures against lines. Four passes (VERBATIM §6.2).
  analyzeCaptures() {
    const player = this.player;

    // Pass 1: a capture I can make that disrupts an opponent threat -> add capture move as a response.
    for (const t of this.threats[3 - player]) {
      if (t.type === TYPE_POTENTIAL_CAPTURE) {
        outer1: for (const t2 of this.threats[player]) {
          for (let i = 0; i < t.numMoves; i++) {
            for (let j = 0; j < t2.numMoves; j++) {
              if (t.moves[i] === t2.moves[j]) {
                const resp = t.resps[0];
                t2.addResp(resp);
                continue outer1;
              }
            }
          }
        }
      }
    }

    // Pass 2: a pair-capture that disrupts an opponent threat (not already a four) -> add BOTH resps.
    for (const t of this.pairs[3 - player]) {
      outer2: for (const t2 of this.threats[player]) {
        // opponent has a 4, so no time to capture
        if (t2.type > TYPE_TRIA) continue;
        for (let i = 0; i < t.numMoves; i++) {
          for (let j = 0; j < t2.numMoves; j++) {
            if (t.moves[i] === t2.moves[j]) {
              const resp1 = t.resps[0];
              const resp2 = t.resps[1];
              t2.addResp(resp1);
              t2.addResp(resp2);
              continue outer2;
            }
          }
        }
      }
    }

    // Pass 3: win-by-capture for the to-move player (3-player). capBoard sized W*H+1.
    const capBoard = new Array(this.boardSize).fill(0);
    for (const t of this.threats[3 - player]) {
      if (t.type === TYPE_POTENTIAL_CAPTURE) {
        capBoard[t.captureMove] += 2;
      }
    }
    for (const t of this.threats[3 - player]) {
      if (t.type === TYPE_POTENTIAL_CAPTURE) {
        if (capBoard[t.captureMove] + this.caps[3 - player] > 8) {
          capBoard[t.captureMove] = 0; // reset so only ONE capture gets its rank updated
          t.movesToWin = 1;
        }
      }
    }

    // Pass 4: lose-by-capture for `player` (identical, over threats[player]/caps[player]).
    for (const t of this.threats[player]) {
      if (t.type === TYPE_POTENTIAL_CAPTURE) {
        if (capBoard[t.captureMove] + this.caps[player] > 8) {
          capBoard[t.captureMove] = 0;
          t.movesToWin = 1;
        }
      }
    }
  }

  // getNextMoveRanks — build, score, sort, cull candidate moves (VERBATIM §6.5).
  getNextMoveRanks() {
    const player = this.player;

    // (a) experimental baseline set
    const maxThreats = [];
    let minMovesToWin = 100;
    for (const t of this.threats[3 - player]) {
      if (t.movesToWin === 0) continue;
      else if (t.movesToWin < minMovesToWin) minMovesToWin = t.movesToWin;
    }
    for (const t of this.threats[3 - player]) {
      if (t.movesToWin === minMovesToWin) maxThreats.push(t);
    }
    minMovesToWin += 2;

    const moves = new Array(this.boardSize).fill(null); // Rank[W*H+1]

    // (b) offense pass — to-move player's own threats
    for (const t of this.threats[3 - player]) {
      if (t.movesToWin === 0) continue; // no way to win w/o caps
      if (RANKS_OFFENSE[t.type] === 0) continue; // ignore 0 ranks
      for (let i = 0, j = t.next.length; i < t.next.length; i++, j--) {
        const m = t.next[i];
        let r = moves[m];
        if (r != null) {
          r.addOffenseRank(RANKS_OFFENSE[t.type] + j);
          if (t.movesToWin < r.getOffenseGroup()) {
            r.setOffenseGroup(t.movesToWin);
          }
        } else {
          r = new Rank(m);
          r.setOffenseGroup(t.movesToWin);
          r.addOffenseRank(RANKS_OFFENSE[t.type] + j);
          // experimental
          if (t.movesToWin > minMovesToWin) {
            r.setOffenseGroup(minMovesToWin);
            for (const mt of maxThreats) {
              if (!mt.next.includes(m)) {
                r.addOffenseRank(RANKS_OFFENSE[TYPE_PRIOR[mt.type]]);
              }
            }
          }
          // end experimental
          moves[m] = r;
        }
      }
    }

    // (c) defense pass — blocking opponent threats
    for (const t of this.threats[player]) {
      if (t.movesToWin === 0) continue;
      if (RANKS_DEFENSE[t.type] === 0) continue;
      let movesToWin = t.movesToWin + 1; // since on defense
      if (t.type === TYPE_POTENTIAL_FOUR) {
        movesToWin++;
      }
      for (let idx = 0; idx < t.resps.length; idx++) {
        const m = t.resps[idx];
        if (m === 0) continue;
        let r = moves[m];
        if (r != null) {
          r.addDefenseRank(RANKS_DEFENSE[t.type]);
          if (movesToWin < r.getDefenseGroup()) {
            r.setDefenseGroup(movesToWin);
          }
        } else {
          r = new Rank(m);
          r.setDefenseGroup(movesToWin);
          r.addDefenseRank(RANKS_DEFENSE[t.type]);
          // experimental
          r.setOffenseGroup(minMovesToWin);
          for (const mt of maxThreats) {
            r.addOffenseRank(RANKS_OFFENSE[TYPE_PRIOR[mt.type]]);
          }
          // end experimental
          moves[m] = r;
        }
      }
    }

    // (d) capture-reveal offense — capturing a blocker reveals a hidden threat.
    // QUIRK #7 / latent risk (port-doc §8.4): this dereferences moves[capMove] which is
    // non-null ONLY because the offense pass (b) always seeds it first — ordering preserved.
    for (const t of this.threats[3 - player]) {
      if (t.type === TYPE_POTENTIAL_CAPTURE) {
        const c1 = t.moves[0];
        const c2 = t.moves[1];
        const capMove = t.next[0];
        const r = moves[capMove];
        for (const t2 of this.threats[3 - player]) {
          if (t2.blocked === false) continue;
          for (let i = 0; i < t2.numBlocks; i++) {
            if (c1 === t2.blockPositions[i] || c2 === t2.blockPositions[i]) {
              if (!r) continue; // safety: per ordering, r is always seeded by pass (b)
              const posNewGroup = t2.blockedMovesToWin + 2; // +2 since capture reveals threat
              if (r.getOffenseGroup() > posNewGroup) {
                r.setOffenseGroup(posNewGroup);
              }
              r.addOffenseRank(RANKS_OFFENSE[t2.typeSinceBlocked]);
            }
          }
        }
      }
    }

    // (e) pair-reveal offense
    for (const t of this.pairs[player]) {
      const c1 = t.moves[0];
      const c2 = t.moves[1];
      const attack1 = t.resps[0];
      const attack2 = t.resps[1];
      const r1 = moves[attack1];
      const r2 = moves[attack2];
      for (const t2 of this.threats[3 - player]) {
        if (t2.blocked === false) continue;
        for (let i = 0; i < t2.numBlocks; i++) {
          if (c1 === t2.blockPositions[i] || c2 === t2.blockPositions[i]) {
            const posNewGroup = t2.blockedMovesToWin + 4; // +4: set up the cap, then make it
            if (r1 && r1.getOffenseGroup() > posNewGroup) {
              r1.setOffenseGroup(posNewGroup);
            }
            if (r1) r1.addOffenseRank(RANKS_OFFENSE[t2.typeSinceBlocked]);
            if (r2 && r2.getOffenseGroup() > posNewGroup) {
              r2.setOffenseGroup(posNewGroup);
            }
            if (r2) r2.addOffenseRank(RANKS_OFFENSE[t2.typeSinceBlocked]);
          }
        }
      }
    }

    // (f) collect non-null ranks in position order, then sort: group asc, ties by rank desc.
    const m = [];
    for (let i = 0; i < moves.length; i++) {
      if (moves[i] != null) m.push(moves[i]);
    }
    m.sort((r1, r2) => {
      if (r2.getGroup() < r1.getGroup()) return 1;
      else if (r2.getGroup() > r1.getGroup()) return -1;
      else return r2.getRank() - r1.getRank();
    });

    // (g) cull by group tiers
    if (m.length > 0) {
      const maxGroup = m[0].getGroup();
      let threesAndFours = false;
      if (maxGroup === 3) {
        for (let i = 0; i < m.length; i++) {
          if (m[i].getGroup() === 4) {
            threesAndFours = true;
            break;
          }
        }
      }
      for (let i = m.length - 1; i >= 0; i--) {
        const curr = m[i];
        if (maxGroup < 3 && curr.getGroup() > maxGroup) {
          m.splice(i, 1);
        } else if (maxGroup === 3 && threesAndFours && curr.getGroup() >= 5) {
          m.splice(i, 1);
        } else if (maxGroup === 4 && curr.getGroup() >= 5) {
          m.splice(i, 1);
        }
      }
    }

    return m;
  }

  getNextMoves() {
    return this.getNextMoveRanks().map((r) => r.move);
  }
}

// ---------------------------------------------------------------------------------------
// PenteAnalyzer (PenteAnalyzer.java). Builds line + capture threats per stone, then ranks.
// ---------------------------------------------------------------------------------------
class PenteAnalyzer {
  constructor(board) {
    this.board = board;
    const x = board.getGridSizeX();
    // §2.2 direction step-deltas (VERBATIM). surrounding = 4 line orientations; FULL_SURROUND
    // adds their negatives (capture scan is directional).
    this.surrounding = [x + 1, 1, -x + 1, x];
    this.FULL_SURROUND = [x + 1, 1, -x + 1, x, -x - 1, -1, x - 1, -x];
    this.boardSize = board.getGridSizeX() * board.getGridSizeY() + 1; // W*H+1 (port rule)
  }

  // §9 driver — rescans the ENTIRE move history every call.
  analyzeMove() {
    const board = this.board;
    const move = board.getMove(board.getNumMoves() - 1);
    const p = board.getPosition(move);

    const analysis = new PositionAnalysis(
      [0, board.getNumCaptures(1), board.getNumCaptures(2)],
      this.boardSize,
    );
    analysis.move = move;
    analysis.player = p;

    for (let i = 0; i < board.getNumMoves(); i++) {
      const m = board.getMove(i);
      const c = board.getPosition(m);
      // §9.1 captured-stone filter (QUIRK #4): strict alternation is assumed. If the cell no
      // longer holds the expected colour, the stone was captured/removed -> skip.
      if (c !== (i % 2) + 1) {
        continue;
      }
      this.findLines(m, c, analysis);
      this.findCaps(m, c, analysis);
    }
    analysis.analyzeCaptures();
    return analysis;
  }

  // §7 capture + pair detection. All four cells validated against `move` (QUIRK #2).
  findCaps(move, p, analysis) {
    const board = this.board;
    const op = 3 - p;
    for (let i = 0; i < 8; i++) {
      const d = this.FULL_SURROUND[i];
      const c1 = move + d;
      const c2 = c1 + d;
      const c3 = c2 + d;
      const c4 = move - d;
      if (!board.isValidPosition(c1, move)) continue;
      if (!board.isValidPosition(c2, move)) continue;
      if (!board.isValidPosition(c3, move)) continue;
      if (!board.isValidPosition(c4, move)) continue;

      const pos1 = board.getPosition(c1);
      const pos2 = board.getPosition(c2);
      const pos3 = board.getPosition(c3);
      const pos4 = board.getPosition(c4);
      if (pos1 === op && pos2 === op && pos3 === 0) {
        // X . O O _  outward: a potential capture by p
        const t = new Threat();
        t.player = p;
        t.type = TYPE_POTENTIAL_CAPTURE;
        t.movesToWin = 10;
        t.addMove(c1);
        t.addMove(c2);
        t.addNext(c3);
        t.addResp(c3);
        t.captureMove = c3;
        t.threatMove = move;
        analysis.addThreat(t);
      } else if (pos4 === 0 && pos1 === p && pos2 === 0) {
        // _ X X _  (c4 . move . c1 . c2): an exposed own pair, capturable by the opponent
        const t = new Threat();
        t.player = op;
        t.type = TYPE_POTENTIAL_THREE_PAIR;
        t.addMove(move);
        t.addMove(c1);
        t.addResp(c4);
        t.addResp(c2);
        t.threatMove = move;
        analysis.addPair(t);
      }
    }
  }

  // §4 line building — two-phase scan for each of the 4 orientations, then split + classify.
  findLines(origMove, p, analysis) {
    const board = this.board;
    for (let i = 0; i < 4; i++) {
      let move = origMove;
      const d = this.surrounding[i];
      const line = new Line();
      line.move = move;
      line.orientation = i;
      line.p = p;

      // Phase A — scan left, find the leftmost own stone of the run.
      let startRightScan = move;
      let gapsTotal = 0;
      let gapsSinceStart = 0;
      line.myLen = 1;
      while (true) {
        const newMove = move - d;
        let endOp = false;
        let val = 0;
        if (!board.isValidPosition(newMove, move)) {
          endOp = true;
        } else {
          val = board.getPosition(newMove);
          if (val === op(p)) {
            endOp = true;
          }
        }
        move = newMove;

        if (endOp) {
          this.markExtendedEnd(startRightScan - 3 * d, startRightScan, 0, line);
          this.markEnd(startRightScan - 2 * d, startRightScan, 0, line);
          this.markEnd(startRightScan - d, startRightScan, 1, line);
          break;
        } else if (val === p) {
          startRightScan = move;
          gapsSinceStart = 0;
          line.myLen++;
        } else if (val === 0) {
          gapsTotal++;
          gapsSinceStart++;
        }

        if (gapsTotal === 3) {
          this.markExtendedEnd(startRightScan - 3 * d, startRightScan, 0, line);
          this.markEnd(startRightScan - 2 * d, startRightScan, 0, line);
          this.markEnd(startRightScan - d, startRightScan, 1, line);
          break;
        }
      }

      // Phase B — reset, then scan right from startRightScan, filling the core.
      line.len = 3;
      line.positions[2] = startRightScan;
      line.moves[2] = p;
      line.myLen = 1;

      move = startRightScan;
      gapsTotal = 0;
      let gapsSinceEnd = 0;
      let endRightScan = move;
      while (true) {
        const newMove = move + d;
        let endOp = false;
        let val = 0;
        if (!board.isValidPosition(newMove, move)) {
          endOp = true;
        } else {
          val = board.getPosition(newMove);
          if (val === op(p)) {
            endOp = true;
          }
        }
        move = newMove;

        if (endOp) {
          line.len = line.myLen + line.gaps + 4 - gapsSinceEnd;
          this.markEnd(endRightScan + d, endRightScan, line.len - 2, line);
          this.markEnd(endRightScan + 2 * d, endRightScan, line.len - 1, line);
          this.markExtendedEnd(endRightScan + 3 * d, endRightScan, 1, line);
          break;
        } else if (val === p) {
          endRightScan = move;
          gapsSinceEnd = 0;
          line.myLen++;
        } else if (val === 0) {
          gapsTotal++;
          gapsSinceEnd++;
          line.gaps++;
        }

        line.moves[line.len] = val;
        line.positions[line.len] = move;

        if (gapsTotal === 3) {
          line.len = line.myLen + line.gaps + 4 - gapsSinceEnd;
          this.markEnd(endRightScan + d, endRightScan, line.len - 2, line);
          this.markEnd(endRightScan + 2 * d, endRightScan, line.len - 1, line);
          this.markExtendedEnd(endRightScan + 3 * d, endRightScan, 1, line);
          break;
        }

        line.len++;
      }
      line.gaps = gapsTotal - gapsSinceEnd; // drop trailing gaps

      const lines = line.split();
      for (const l of lines) {
        const ts = l.findThreat();
        if (ts != null) {
          for (let k = 0; k < ts.length; k++) {
            analysis.addThreat(ts[k]);
          }
        }
      }
    }
  }

  // §3.3 markEnd / markExtendedEnd — write a cell's colour into a slot, or WALL if off-board.
  markEnd(newMove, oldMove, endPos, line) {
    if (this.board.isValidPosition(newMove, oldMove)) {
      line.positions[endPos] = newMove;
      line.moves[endPos] = this.board.getPosition(line.positions[endPos]);
    } else {
      line.positions[endPos] = 0;
      line.moves[endPos] = WALL;
    }
  }

  markExtendedEnd(newMove, oldMove, endPos, line) {
    if (this.board.isValidPosition(newMove, oldMove)) {
      line.thirdOuterPositions[endPos] = newMove;
      line.thirdOuterMoves[endPos] = this.board.getPosition(line.thirdOuterPositions[endPos]);
    } else {
      line.thirdOuterPositions[endPos] = 0;
      line.thirdOuterMoves[endPos] = WALL;
    }
  }
}

// "other player" helper (op = 3 - p), matching the Java `op` local.
function op(p) {
  return 3 - p;
}

// ---------------------------------------------------------------------------------------
// Output mapping — Threat/Rank objects -> the plain shapes the workbench UI (Task 4) consumes.
// ---------------------------------------------------------------------------------------
function mapThreat(t) {
  return {
    type: t.type,
    player: t.player,
    cells: t.moves.slice(0, t.numMoves), // sorted-ascending stone positions
    gainSquares: t.next.slice(), // offensive advancing squares
    resps: t.resps.slice(), // defensive squares
    movesToWin: t.movesToWin,
    blockedMovesToWin: t.blockedMovesToWin,
    typeSinceBlocked: t.typeSinceBlocked,
    blocked: t.blocked,
    blockPositions: t.blockPositions.slice(0, t.numBlocks),
    captureMove: t.captureMove,
  };
}

function mapRank(r) {
  const reasons = [];
  if (r.offenseRank !== 0) {
    reasons.push({ kind: 'offense', rank: r.offenseRank, group: r.offenseGroup });
  }
  if (r.defenseRank !== 0) {
    reasons.push({ kind: 'defense', rank: r.defenseRank, group: r.defenseGroup });
  }
  return { cell: r.move, rank: r.getRank(), group: r.getGroup(), reasons };
}

/**
 * Analyze a Pente board position for threats and ranked candidate moves.
 *
 * @param {object}   args
 * @param {object}   args.game   Board-state provider: getPosition(pos) -> 0|1|2 (reflecting
 *                               captures) and captures[] ([_, p1StonesRemoved, p2StonesRemoved]).
 * @param {number[]} args.moves  Flat board-index move list in play order.
 * @param {number}   [args.boardW=19]
 * @param {number}   [args.boardH=19]
 * @returns {{threats: object[], pairs: object[], ranks: object[]}}
 *   threats/pairs: {type, player, cells, gainSquares, resps, movesToWin, blockedMovesToWin,
 *                   typeSinceBlocked, blocked, blockPositions, captureMove} for both players.
 *   ranks: {cell, rank, group, reasons} — ordered candidate moves (best/most-urgent first).
 */
export function analyzePosition({ game, moves, boardW = 19, boardH = 19 }) {
  if (!moves || moves.length === 0) {
    return { threats: [], pairs: [], ranks: [] };
  }

  const board = new BoardState(game, moves, boardW, boardH);
  const analyzer = new PenteAnalyzer(board);
  const analysis = analyzer.analyzeMove();

  const threats = [];
  for (let player = 1; player <= 2; player++) {
    for (const t of analysis.threats[player]) threats.push(mapThreat(t));
  }
  const pairs = [];
  for (let player = 1; player <= 2; player++) {
    for (const t of analysis.pairs[player]) pairs.push(mapThreat(t));
  }
  const ranks = analysis.getNextMoveRanks().map(mapRank);

  return { threats, pairs, ranks };
}

// Exposed for advanced callers / tests that want the raw analysis object.
export { PenteAnalyzer, PositionAnalysis, BoardState, Threat, Line, Rank };
