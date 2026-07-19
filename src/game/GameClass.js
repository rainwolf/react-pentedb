import {useEffect, useRef} from "react";
import {GameState, freshRenjuTracking} from './gameState';
import {gridSizeForGame, isGoBoard, variantKey} from '../board/boardGeometry';
import {
   swap2OpeningPlayer,
   dPenteOpeningPlayer,
   isSwap2Choice,
   isSwap2CanPass,
   isDPenteChoice,
   renjuPhase,
   renjuOpeningPlayer,
   isRenjuSwapChoice,
   isRenjuBranchChoice,
} from './openingPhase';

// Re-exported so existing `import {GameState} from '.../GameClass'` call sites keep working.
export {GameState};

const coordinateLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

// Per-variant rule profile, keyed by the canonical variantKey — the single source for the
// move/replay dispatch that was triplicated across replayGame / addMoveFromList / addMove.
// Several variants share a rule engine (pente serves d-pente/boat-pente/swap2-pente; keryo
// serves dk-pente/swap2-keryo), and a few have quirks: d-pente/dk-pente disable rated during
// replay; connect6 replays as Connect6 but adds as Gomoku and uses its own player formula;
// go applies moves by index, not (x,y). `replay`/`add` name the engine; `postRule` is the
// tournament/g-pente correction applied after a move; `player` selects the seat formula.
const VARIANT_RULES = {
   'pente':       {replay: 'pente',    disableRatedOnReplay: false, add: 'pente',  goMove: false, player: 'standard', postRule: 'tournament'},
   'keryo-pente': {replay: 'keryo',    disableRatedOnReplay: false, add: 'keryo',  goMove: false, player: 'standard', postRule: 'tournament'},
   'gomoku':      {replay: 'gomoku',   disableRatedOnReplay: false, add: 'gomoku', goMove: false, player: 'standard', postRule: 'none'},
   'd-pente':     {replay: 'pente',    disableRatedOnReplay: true,  add: 'pente',  goMove: false, player: 'standard', postRule: 'none'},
   'g-pente':     {replay: 'gPente',   disableRatedOnReplay: false, add: 'pente',  goMove: false, player: 'standard', postRule: 'gPente'},
   'poof-pente':  {replay: 'poof',     disableRatedOnReplay: false, add: 'poof',   goMove: false, player: 'standard', postRule: 'tournament'},
   'connect6':    {replay: 'connect6', disableRatedOnReplay: false, add: 'gomoku', goMove: false, player: 'connect6', postRule: 'none'},
   'boat-pente':  {replay: 'pente',    disableRatedOnReplay: false, add: 'pente',  goMove: false, player: 'standard', postRule: 'tournament'},
   'dk-pente':    {replay: 'keryo',    disableRatedOnReplay: true,  add: 'keryo',  goMove: false, player: 'standard', postRule: 'none'},
   'go':          {replay: 'go',       disableRatedOnReplay: false, add: null,     goMove: true,  player: 'standard', postRule: 'none'},
   'o-pente':     {replay: 'oPente',   disableRatedOnReplay: false, add: 'oPente', goMove: false, player: 'standard', postRule: 'tournament'},
   'swap2-pente': {replay: 'pente',    disableRatedOnReplay: false, add: 'pente',  goMove: false, player: 'standard', postRule: 'none'},
   'swap2-keryo': {replay: 'keryo',    disableRatedOnReplay: false, add: 'keryo',  goMove: false, player: 'standard', postRule: 'none'},
   'renju':       {replay: 'renju',    disableRatedOnReplay: false, add: 'gomoku', goMove: false, player: 'renju',    postRule: 'none'},
};

export class Game {
   constructor(gameState) {
      this.updateGameState(gameState);
      this.rated = false;
      this.abstractBoard = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ];
      this.reset();
   }

   newInstance = () => {
      const newGame = new Game();
      newGame.captures = this.captures;
      newGame.moves = this.moves;
      newGame.goGroupsByPlayerAndID = this.goGroupsByPlayerAndID;
      newGame.goStoneGroupIDsByPlayer = this.goStoneGroupIDsByPlayer;
      newGame.koMove = this.koMove;
      newGame.suicideAllowed = this.suicideAllowed;
      newGame.goTerritoryByPlayer = this.goTerritoryByPlayer;
      newGame.hasPass = this.hasPass;
      newGame.doublePass = this.doublePass;
      newGame.goDeadStonesByPlayer = this.goDeadStonesByPlayer;
      newGame.setGame(this.game);
      newGame.rated = this.rated;
      newGame.me = this.me;
      newGame.gameState = {
         ...this.gameState,
         renjuState: {
            ...this.gameState.renjuState,
            offered: [...this.gameState.renjuState.offered],
         },
      };
      // for (let i = 0; i < 19; i++) {
      //     for (let j = 0; j < 19; j++) {
      //         newGame.abstractBoard[i][j] = this.abstractBoard[i][j];
      //     }
      // }
      newGame.abstractBoard = this.abstractBoard;
      newGame.mark_dead_stones_player = this.mark_dead_stones_player;
      newGame.evaluate_stones_player = this.evaluate_stones_player;
      newGame.until = this.until;

      return newGame;
   };

   updateGameState = (gameState) => {
      Object.assign(this, gameState);
   };

   setGame = (game) => {
      this.game = game;
      this.gridSize = gridSizeForGame(game);
   };

   critical_captures = (color) => {
      let threshold = 7;
      if (this.game === 3 || this.game === 4 || this.game === 17 || this.game === 18 || this.game === 25 || this.game === 26) {
         threshold = 11;
      } else if (this.isGo()) {
         return false;
      }
      return this.captures[color] > threshold;
   };

   last_move = () => {
      let l;
      l = this.until - 1;
      if (this.until === undefined) {
         l = this.moves.length - 1;
      }
      if (this.isConnect6()) {
         if (l === 0 || l % 4 === 1 || l % 4 === 3) {
            return [this.moves[l]];
         } else {
            return [this.moves[l - 1], this.moves[l]];
         }
      } else if ((this.isGo() || this.isRenjuGame()) && l > -1) {
         // Go pass and renju pass share the same sentinel (gridSize*gridSize, see
         // GameInfoPanel.pass()) — never surface it as a board index (Board.js:200
         // does board[move].last_move = true against a gridSize*gridSize-length array).
         const move = this.moves[l];
         if (move !== this.gridSize * this.gridSize) {
            return [move];
         }
      } else if (l > -1) {
         return [this.moves[l]];
      }
      return [];
   };

   goForwardBack = (forward) => {
      if (this.until === undefined) {
         this.until = this.moves.length;
      }
      if (forward) {
         if (this.isConnect6()) {
            if (this.until % 4 === 1 || this.until % 4 === 3) {
               if (this.until < this.moves.length - 1) {
                  this.until += 1;
                  this.addMoveFromList(this.until - 1);
               }
            }
            if (this.until < this.moves.length) {
               this.until += 1;
               this.addMoveFromList(this.until - 1);
            }
         } else {
            if (this.until < this.moves.length) {
               this.until += 1;
               this.addMoveFromList(this.until - 1);
            }
         }
      } else {
         if (this.isConnect6()) {
            if (this.until > 1) {
               if (this.until % 4 === 1 || this.until % 4 === 3) {
                  this.until -= 1;
               }
               this.until -= 1;
               this.replayGame(this.until);
            }
         } else {
            if (this.until > 1) {
               this.until -= 1;
               this.replayGame(this.until);
            }
         }
      }
   };

   goto_move = (i) => {
      if (!this.until || this.until > i) {
         this.until = i;
         this.replayGame(this.until);
      } else {
         while (this.until < i && this.until < this.moves.length) {
            this.until += 1;
            this.addMoveFromList(this.until - 1);
         }
      }
   };

   moves_strings = () => {
      if (this.isConnect6()) {
         const movestrs = [];
         if (this.moves.length > 0) {
            movestrs.push(this.getMoveCoord(this.moves[0]));
         }
         for (let i = 1; i < this.moves.length; i++) {
            let str = this.getMoveCoord(this.moves[i]) + ' - ';
            if (i < this.moves.length - 1) {
               i++;
               str += this.getMoveCoord(this.moves[i]);
            }
            movestrs.push(str);
         }
         return movestrs;
      } else if (this.isGo() || this.isRenjuGame()) {
         // renju shares Go's pass sentinel (gridSize*gridSize) — render it as PASS,
         // not as the bogus coordinate getMoveCoord would produce.
         const passMove = this.gridSize * this.gridSize;
         return this.moves.map(move => move === passMove ? 'PASS' : this.getMoveCoord(move));
      } else {
         return this.moves.map(move => this.getMoveCoord(move));
      }
   };

   canNotLeave = () => {
      return this.gameState.state === GameState.State.STARTED || this.gameState.state === GameState.State.HALFSET;
   };

   currentPlayer = () => {
      if (this.isConnect6()) {
         return (((this.moves.length % 4) === 0) || ((this.moves.length % 4) === 3)) ? 1 : 2;
      } else if (this.#isDPente()) {
         const p = dPenteOpeningPlayer(this.moves.length, this.gameState.dPenteState);
         if (p !== null) {
            return p;
         }
      } else if (this.#isSwap2()) {
         const p = swap2OpeningPlayer(this.moves.length, this.gameState.swap2State);
         if (p !== null) {
            return p;
         }
      } else if (this.#isRenju()) {
         const p = renjuOpeningPlayer(this.moves.length, this.gameState.renjuState);
         if (p !== null) {
            return p;
         }
      } else if (this.isGo() && this.gameState.goState === GameState.GoState.MARK_STONES) {
         return this.mark_dead_stones_player;
      } else if (this.isGo() && this.gameState.goState === GameState.GoState.EVALUATE_STONES) {
         return this.evaluate_stones_player;
      }
      return (1 + (this.moves.length % 2));
   };
   currentColor = () => {
      if (this.isConnect6()) {
         return (((this.moves.length % 4) === 0) || ((this.moves.length % 4) === 3)) ? 1 : 2;
      }
      if (this.#isRenju()) {
         return 2 - (this.moves.length % 2); // black-first hover/ghost
      }
      // const currentColor = 1 + (this.moves.length % 2);
      return 1 + (this.moves.length % 2);
      // if (this.isGo()) {
      //     return 3 - currentColor;
      // }
      // return currentColor;
   };
   renjuPhaseNow = () => {
      return renjuPhase(this.moves.length, this.gameState.renjuState);
   };
   // Box radius about centre for placing the NEXT stone: numMoves for moves 2-5, else 0
   // (whole board — move 6 and normal play). Mirrors the server's box constraint.
   renjuBoxRadius = () => {
      const n = this.moves.length;
      return (n >= 1 && n <= 4) ? n : 0;
   };
   // #isPoofPente = () => {
   //     return this.game === 11 || this.game === 12;
   // };
   #isDPente = () => {
      return this.game === 7 || this.game === 8 || this.game === 17 || this.game === 18;
   };
   isConnect6 = () => {
      return this.game === 13 || this.game === 14;
   };
   isGo = () => isGoBoard(this.game);
   #isSwap2 = () => {
      return this.game === 27 || this.game === 28 || this.game === 29 || this.game === 30;
   };
   // Public so Task 6 reducers / the board can detect renju (#isRenju stays private as the
   // single source for the in-class arms; later tasks call game.isRenjuGame()).
   isRenjuGame = () => {
      return this.game === 31 || this.game === 32 || this.game === 81;
   };
   #isRenju = () => this.isRenjuGame();

   #started = () => this.gameState.state === GameState.State.STARTED;

   dPenteChoice = () => {
      return this.#isDPente() &&
         isDPenteChoice(this.moves.length, this.gameState.dPenteState, this.#started());
   };

   swap2Choice = () => {
      return this.#isSwap2() &&
         isSwap2Choice(this.moves.length, this.gameState.swap2State, this.#started());
   };

   swap2CanPass = () => {
      return this.#isSwap2() &&
         isSwap2CanPass(this.moves.length, this.gameState.swap2State, this.#started());
   };

   swap2Pass = () => {
      this.gameState.swap2State = GameState.Swap2State.SWAP2PASS;
   }

   renjuChoice = () => {
      if (!this.#isRenju()) return false;
      const started = this.gameState.state === GameState.State.STARTED;
      return isRenjuSwapChoice(this.moves.length, this.gameState.renjuState, started)
          || isRenjuBranchChoice(this.moves.length, this.gameState.renjuState, started);
   };

   reset = () => {
      this.resetBoard();

      this.gameState = {
         state: GameState.State.NOT_STARTED,
         dPenteState: GameState.DPenteState.NO_CHOICE,
         swap2State: GameState.Swap2State.NO_CHOICE,
         goState: GameState.GoState.PLAY,
         renjuState: freshRenjuTracking(),
      }
   };
   resetBoard = () => {
      this.captures = [undefined, 0, 0];
      this.moves = [];
      this.goGroupsByPlayerAndID = {1: {}, 2: {}};
      this.goStoneGroupIDsByPlayer = {1: {}, 2: {}};
      this.koMove = -1;
      this.suicideAllowed = false;
      this.goTerritoryByPlayer = {1: [], 2: []};
      this.hasPass = false;
      this.doublePass = false;
      this.goDeadStonesByPlayer = {1: [], 2: []};
      this.#resetAbstractBoard();
   };
   #resetAbstractBoard = () => {
      for (let i = 0; i < 19; i++) {
         for (let j = 0; j < 19; j++) {
            this.abstractBoard[i][j] = 0;
         }
      }
   };

   undoMove = () => {
      const new_moves = this.moves.slice(0, this.moves.length - 1);
      if (this.until === this.moves.length) {
         this.until -= 1;
      }
      this.moves = new_moves;
      this.replayGame();
   };

   replayGame = (until) => {
      if (until === undefined) {
         until = this.moves.length;
      }
      let moves = this.moves;
      this.resetBoard();
      this.moves = moves;
      const rules = VARIANT_RULES[variantKey(this.game)];
      const replay = {
         pente: this.#replayPenteGame, keryo: this.#replayKeryoPenteGame, gomoku: this.#replayGomokuGame,
         gPente: this.#replayGPenteGame, poof: this.#replayPoofPenteGame, connect6: this.#replayConnect6Game,
         go: this.#replayGoGame, oPente: this.#replayOPenteGame, renju: this.#replayRenjuGame,
      }[rules.replay];
      if (rules.disableRatedOnReplay) {
         // d-pente / dk-pente replay through the pente / keryo engine, which applies its own
         // tournament-rule correction when rated; these variants don't use it, so rating is
         // turned off for the replay.
         const r = this.rated;
         this.rated = false;
         replay(until);
         this.rated = r;
      } else {
         replay(until);
      }
   };

   addMoveFromList = (i) => {
      const move = this.moves[i];
      const x = move % this.gridSize, y = Math.floor(move / this.gridSize);
      const rules = VARIANT_RULES[variantKey(this.game)];
      const player = rules.player === 'connect6'
         ? ((((i % 4) === 0) || ((i % 4) === 3)) ? 1 : 2)
         : rules.player === 'renju'
            ? 2 - (i % 2)
            : 1 + (i % 2);
      this.#applyMove(rules, move, x, y, player);
   };

   addMove = (move) => {
      if (this.until && this.until < this.moves.length) {
         while (this.until < this.moves.length) {
            this.until += 1;
            this.addMoveFromList(this.until - 1);
         }
      }
      const x = move % this.gridSize, y = Math.floor(move / this.gridSize);
      this.moves.push(move);
      this.until = this.moves.length;
      const rules = VARIANT_RULES[variantKey(this.game)];
      const player = rules.player === 'connect6'
         ? ((((this.moves.length % 4) === 1) || ((this.moves.length % 4) === 0)) ? 1 : 2)
         : rules.player === 'renju'
            ? 1 + (this.moves.length % 2)   // moves.length==1 -> 2 (black-first)
            : 2 - (this.moves.length % 2);
      this.#applyMove(rules, move, x, y, player);
   };

   // Apply one move through the variant's rule engine, then its post-move correction. Go
   // applies by board index; every other variant by (x, y).
   #applyMove = (rules, move, x, y, player) => {
      if (rules.goMove) {
         this.#addGoMove(move, player);
      } else {
         ({
            pente: this.#addPenteMove, keryo: this.#addKeryoPenteMove, gomoku: this.#addGomokuMove,
            poof: this.#addPoofPenteMove, oPente: this.#addOPenteMove,
         }[rules.add])(x, y, player);
      }
      this.#applyPostRule(rules.postRule);
   };

   // The rated-only correction applied after moves 2 and 3 (tournament rule for most
   // capture variants, the g-pente rule for g-pente; none for the rest).
   #applyPostRule = (kind) => {
      if (kind === 'tournament') {
         if (this.rated && this.moves.length === 2) {
            this.#applyTournamentRule();
         } else if (this.rated && this.moves.length === 3) {
            this.#undoTournamentRule();
         }
      } else if (kind === 'gPente') {
         if (this.rated && this.moves.length === 2) {
            this.#applyGPenteRule();
         } else if (this.rated && this.moves.length === 3) {
            this.#undoGPenteRule();
         }
      }
   };

   #applyTournamentRule = () => {
      for (let i = 7; i < 12; ++i) {
         for (let j = 7; j < 12; ++j) {
            if (this.abstractBoard[i][j] === 0) {
               this.abstractBoard[i][j] = -1;
            }
         }
      }
   };
   #undoTournamentRule = () => {
      for (let i = 7; i < 12; ++i) {
         for (let j = 7; j < 12; ++j) {
            if (this.abstractBoard[i][j] === -1) {
               this.abstractBoard[i][j] = 0;
            }
         }
      }
   };
   #applyGPenteRule = () => {
      this.#applyTournamentRule();
      for (let i = 1; i < 3; i++) {
         if (this.abstractBoard[9][11 + i] === 0) {
            this.abstractBoard[9][11 + i] = -1;
         }
         if (this.abstractBoard[9][7 - i] === 0) {
            this.abstractBoard[9][7 - i] = -1;
         }
         if (this.abstractBoard[11 + i][9] === 0) {
            this.abstractBoard[11 + i][9] = -1;
         }
         if (this.abstractBoard[7 - i][9] === 0) {
            this.abstractBoard[7 - i][9] = -1;
         }
      }
   };
   #undoGPenteRule = () => {
      this.#undoTournamentRule();
      for (let i = 1; i < 3; i++) {
         if (this.abstractBoard[9][11 + i] === -1) {
            this.abstractBoard[9][11 + i] = 0;
         }
         if (this.abstractBoard[9][7 - i] === -1) {
            this.abstractBoard[9][7 - i] = 0;
         }
         if (this.abstractBoard[11 + i][9] === -1) {
            this.abstractBoard[11 + i][9] = 0;
         }
         if (this.abstractBoard[7 - i][9] === -1) {
            this.abstractBoard[7 - i][9] = 0;
         }
      }
   };
   #addGomokuMove = (x, y, player) => {
      this.abstractBoard[x][y] = player;
   };
   #replayGomokuGame = (until) => {
      // this.#resetAbstractBoard();
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let color = 1 + (i % 2);
         let x = this.moves[i] % 19, y = Math.floor(this.moves[i] / 19);
         this.#addGomokuMove(x, y, color);
      }
   };
   #replayRenjuGame = (until) => {
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let color = 2 - (i % 2); // i=0 -> 2 (black-first); gomoku is white-first (1 + i%2)
         let x = this.moves[i] % this.gridSize, y = Math.floor(this.moves[i] / this.gridSize);
         this.#addGomokuMove(x, y, color);
      }
   };
   #addPenteMove = (x, y, player) => {
      this.#addGomokuMove(x, y, player);
      this.#detectPenteCapture(x, y, player);
   };
   #replayPenteGame = (until) => {
      // this.#resetAbstractBoard();
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let color = 1 + (i % 2);
         let x = this.moves[i] % 19, y = Math.floor(this.moves[i] / 19);
         this.#addPenteMove(x, y, color);
      }
      if (this.rated && (this.moves.length === 2)) {
         this.#applyTournamentRule();
      }
   };
   #addKeryoPenteMove = (x, y, player) => {
      this.#addPenteMove(x, y, player);
      this.#detectKeryoPenteCapture(x, y, player);
   };
   #replayKeryoPenteGame = (until) => {
      // this.#resetAbstractBoard();
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let color = 1 + (i % 2);
         let x = this.moves[i] % 19, y = Math.floor(this.moves[i] / 19);
         this.#addKeryoPenteMove(x, y, color);
      }
      if (this.rated && (this.moves.length === 2)) {
         this.#applyTournamentRule();
      }
   };
   #replayConnect6Game = (until) => {
      // this.#resetAbstractBoard();
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let color = (((i % 4) === 0) || ((i % 4) === 3)) ? 1 : 2;
         let x = this.moves[i] % 19, y = Math.floor(this.moves[i] / 19);
         this.#addGomokuMove(x, y, color);
      }
   };
   #replayGPenteGame = (until) => {
      // this.#resetAbstractBoard();
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let color = 1 + (i % 2);
         let x = this.moves[i] % 19, y = Math.floor(this.moves[i] / 19);
         this.#addPenteMove(x, y, color);
      }
      if (this.moves.length === 2) {
         this.#applyGPenteRule();
      }
   };
   #addPoofPenteMove = (x, y, player) => {
      this.#addGomokuMove(x, y, player);
      this.#detectPoof(x, y, player);
      this.#detectPenteCapture(x, y, player);
   };
   #replayPoofPenteGame = (until) => {
      // this.#resetAbstractBoard();
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let color = 1 + (i % 2);
         let x = this.moves[i] % 19, y = Math.floor(this.moves[i] / 19);
         this.#addPoofPenteMove(x, y, color);
      }
      if (this.rated && (this.moves.length === 2)) {
         this.#applyTournamentRule();
      }
   };
   #addOPenteMove = (x, y, player) => {
      this.#addGomokuMove(x, y, player);
      this.#detectPoof(x, y, player);
      this.#detectKeryoPoof(x, y, player);
      this.#detectPenteCapture(x, y, player);
      this.#detectKeryoPenteCapture(x, y, player);
   };
   #replayOPenteGame = (until) => {
      // this.#resetAbstractBoard();
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let color = 1 + (i % 2);
         let x = this.moves[i] % 19, y = Math.floor(this.moves[i] / 19);
         this.#addOPenteMove(x, y, color);
      }
      if (this.rated && (this.moves.length === 2)) {
         this.#applyTournamentRule();
      }
   };


   #replayGoGame = (until) => {
      this.#resetAbstractBoard();
      // const passMove = this.gridSize*this.gridSize;
      this.goGroupsByPlayerAndID = {1: {}, 2: {}};
      this.goStoneGroupIDsByPlayer = {1: {}, 2: {}};
      this.goDeadStonesByPlayer = {1: [], 2: []};
      // let p1DeadStones = this.goDeadStonesByPlayer[1], p2DeadStones = this.goDeadStonesByPlayer[2];
      this.koMove = -1;
      this.hasPass = false;
      this.doublePass = false;
      this.gameState.goState = GameState.GoState.PLAY;
      this.captures = [undefined, 0, 0];
      for (let i = 0; i < Math.min(this.moves.length, until); i++) {
         let move = this.moves[i];
         // if (move === passMove) {
         //     if (this.hasPass) {
         //         this.doublePass = true;
         //     } else {
         //         this.hasPass = true;
         //     }
         // } else {
         //     this.hasPass = false;
         // }
         let player = 1 + (i % 2);
         // this.abstractBoard[move % this.gridSize][Math.floor(move / this.gridSize)] = player;

         this.#addGoMove(move, player);
         // if (move !== passMove && !this.doublePass) {
         //     let player = 1 + (i%2);
         //     this.abstractBoard[move % this.gridSize][Math.floor(move / this.gridSize)] = player;
         //     this.#addGoMove(move, 3-player);
         // } else if (this.doublePass && move !== passMove) {
         //     let pos = this.getPosition(move);
         //     if (pos === 1) {
         //         p1DeadStones.push(move);
         //     } else if (pos === 2) {
         //         p2DeadStones.push(move);
         //     }
         //     this.#setPosition(move, 0);
         // }
      }
   };

   #find_dead_stones_player = () => {
      let pass = false;
      const pass_move = this.gridSize * this.gridSize;
      // console.log('moves = ', JSON.stringify(this.moves))
      for (let i = 0; i < this.moves.length; i++) {
         if (this.moves[i] === pass_move) {
            if (pass) {
               this.mark_dead_stones_player = 1 + (i + 1) % 2;
               break;
            } else {
               pass = true;
            }
         } else {
            pass = false;
         }
      }
   };

   #addGoMove = (move, currentPlayer) => {
      if (move === this.gridSize * this.gridSize) {
         if (this.gameState.goState === GameState.GoState.MARK_STONES) {
            this.gameState.goState = GameState.GoState.EVALUATE_STONES;
            this.evaluate_stones_player = 3 - this.mark_dead_stones_player;
         } else if (this.gameState.goState === GameState.GoState.PLAY) {
            if (this.hasPass) {
               this.doublePass = true;
               this.gameState.goState = GameState.GoState.MARK_STONES;
               this.#getTerritories();
               this.#find_dead_stones_player();
               // console.log('dead player = ', this.mark_dead_stones_player)
            } else {
               this.hasPass = true;
            }
         }
      } else {
         this.hasPass = false;
         this.doublePass = false;
      }
      if (move >= this.gridSize * this.gridSize) {
         return;
      }
      // if (this.doublePass) {
      if (this.gameState.goState === GameState.GoState.MARK_STONES) {
         let pos = this.getPosition(move);
         this.goDeadStonesByPlayer[pos].push(move);
         this.#setPosition(move, 0);
         this.#getTerritories();
         return;
      }
      this.#setPosition(move, currentPlayer);

      let opponent = 3 - currentPlayer;

      let groupsByID = this.goGroupsByPlayerAndID[currentPlayer];
      let stoneGroupIDs = this.goStoneGroupIDsByPlayer[currentPlayer];

      this.#settleGroups(move, groupsByID, stoneGroupIDs);
      groupsByID = this.goGroupsByPlayerAndID[opponent];
      stoneGroupIDs = this.goStoneGroupIDsByPlayer[opponent];
      this.#makeCaptures(move, groupsByID, stoneGroupIDs, opponent);

      if (this.suicideAllowed === true) {
         groupsByID = this.goGroupsByPlayerAndID[currentPlayer];
         stoneGroupIDs = this.goStoneGroupIDsByPlayer[currentPlayer];
         let moveGroupID = stoneGroupIDs[move];
         let moveGroup = groupsByID[moveGroupID];
         if (!this.#groupHasLiberties(moveGroup)) {
            this.captures[currentPlayer] += moveGroup.size();
            // if (currentPlayer !== 1) {
            //     whiteCaptures += moveGroup.size();
            // } else {
            //     blackCaptures += moveGroup.size();
            // }
            this.#captureGroup(moveGroupID, groupsByID, stoneGroupIDs);
         }
      }
   };

   #makeCaptures = (move, groupsByID, stoneGroupIDs, colorToCapture) => {
      let captures = 0;
      if (move % this.gridSize !== 0) {
         let neighborStone = move - 1;
         let neighborStoneGroupID = stoneGroupIDs[neighborStone];
         captures = this.#getCaptures(move, groupsByID, stoneGroupIDs, captures, neighborStone, neighborStoneGroupID);
      }
      if (move % this.gridSize !== this.gridSize - 1) {
         let neighborStone = move + 1;
         let neighborStoneGroupID = stoneGroupIDs[neighborStone];
         captures = this.#getCaptures(move, groupsByID, stoneGroupIDs, captures, neighborStone, neighborStoneGroupID);
      }
      if (Math.floor(move / this.gridSize) !== 0) {
         let neighborStone = move - this.gridSize;
         let neighborStoneGroupID = stoneGroupIDs[neighborStone];
         captures = this.#getCaptures(move, groupsByID, stoneGroupIDs, captures, neighborStone, neighborStoneGroupID);
      }
      if (Math.floor(move / this.gridSize) !== this.gridSize - 1) {
         let neighborStone = move + this.gridSize;
         let neighborStoneGroupID = stoneGroupIDs[neighborStone];
         captures = this.#getCaptures(move, groupsByID, stoneGroupIDs, captures, neighborStone, neighborStoneGroupID);
      }
      if (captures !== 1) {
         this.koMove = -1;
      }
      this.captures[colorToCapture] += captures;
      // console.log(captures);
      // if (colorToCapture === 1) {
      //     blackCaptures += captures;
      // } else {
      //     whiteCaptures += captures;
      // }
   };

   #getCaptures = (move, groupsByID, stoneGroupIDs, captures, neighborStone, neighborStoneGroupID) => {
      if (neighborStoneGroupID === undefined) {
         return captures;
      }
      let newCaptures = captures;
      let neighborStoneGroup = groupsByID[neighborStoneGroupID];
      // console.log(getMoveCoord(move));
      // console.log(groupsByID);
      if (neighborStoneGroup !== undefined) {
         if (this.#groupHasLiberties(neighborStoneGroup) === false) {
            if (this.koMove < 0 && neighborStoneGroup.length === 1 && this.#checkKo(move)) {
               this.koMove = neighborStone;
            } else {
               this.koMove = -1;
            }
            newCaptures = captures + neighborStoneGroup.length;
            this.#captureGroup(neighborStoneGroupID, groupsByID, stoneGroupIDs);
         }
      }
      return newCaptures;
   };
   #checkKo = (move) => {
      let position = this.getPosition(move);
      if (move % this.gridSize !== 0) {
         let neighborStone = move - 1;
         let neighborPosition = this.getPosition(neighborStone);
         if (position !== 3 - neighborPosition) {
            return false;
         }
      }
      if (move % this.gridSize !== this.gridSize - 1) {
         let neighborStone = move + 1;
         let neighborPosition = this.getPosition(neighborStone);
         if (position !== 3 - neighborPosition) {
            return false;
         }
      }
      if (Math.floor(move / this.gridSize) !== 0) {
         let neighborStone = move - this.gridSize;
         let neighborPosition = this.getPosition(neighborStone);
         if (position !== 3 - neighborPosition) {
            return false;
         }
      }
      if (Math.floor(move / this.gridSize) !== this.gridSize - 1) {
         let neighborStone = move + this.gridSize;
         let neighborPosition = this.getPosition(neighborStone);
         if (position !== 3 - neighborPosition) {
            return false;
         }
      }
      return true;
   };
   #captureGroup = (groupID, groupsByID, stoneGroupIDs) => {
      let group = groupsByID[groupID];
      for (let i = 0; i < group.length; ++i) {
         this.#setPosition(group[i], 0);
         delete stoneGroupIDs[group[i]];
      }
      delete groupsByID[groupID];
   };
   #groupHasLiberties = (group) => {
      for (let i = 0; i < group.length; i++) {
         if (this.#stoneHasLiberties(group[i]) === true) {
            return true;
         }
      }
      return false;
   };

   #stoneHasLiberties = (stone) => {
      if (stone % this.gridSize !== 0) {
         let neighborStone = stone - 1;
         let position = this.getPosition(neighborStone);
         if (position !== 1 && position !== 2) {
            return true;
         }
      }
      if (stone % this.gridSize !== this.gridSize - 1) {
         let neighborStone = stone + 1;
         let position = this.getPosition(neighborStone);
         if (position !== 1 && position !== 2) {
            return true;
         }
      }
      if (Math.floor(stone / this.gridSize) !== 0) {
         let neighborStone = stone - this.gridSize;
         let position = this.getPosition(neighborStone, true);
         if (position !== 1 && position !== 2) {
            return true;
         }
      }
      if (Math.floor(stone / this.gridSize) !== this.gridSize - 1) {
         let neighborStone = stone + this.gridSize;
         let position = this.getPosition(neighborStone);
         if (position !== 1 && position !== 2) {
            return true;
         }
      }
      return false;
   };

   getMoveCoord = (move) => {
      let letter = coordinateLetters[move % this.gridSize];
      let number = this.gridSize - Math.floor(move / this.gridSize);
      return letter + number;
   };
   getPosition = (move) => {
      return this.abstractBoard[move % this.gridSize][Math.floor(move / this.gridSize)];
   };
   #setPosition = (move, val) => {
      this.abstractBoard[move % this.gridSize][Math.floor(move / this.gridSize)] = val;
   };

   #settleGroups = (move, groupsByID, stoneGroupIDs) => {
      let newGroup = [];
      newGroup.push(move);
      groupsByID[move] = newGroup;
      stoneGroupIDs[move] = move;

      if (move % this.gridSize !== 0) {
         let neighborStone = move - 1;
         let neighborStoneGroupID = stoneGroupIDs[neighborStone];
         if (neighborStoneGroupID !== undefined) {
            this.#mergeGroups(move, neighborStoneGroupID, groupsByID, stoneGroupIDs);
         }
      }
      if (move % this.gridSize !== this.gridSize - 1) {
         let neighborStone = move + 1;
         let neighborStoneGroupID = stoneGroupIDs[neighborStone];
         if (neighborStoneGroupID !== undefined) {
            this.#mergeGroups(stoneGroupIDs[move], neighborStoneGroupID, groupsByID, stoneGroupIDs);
         }
      }
      if (Math.floor(move / this.gridSize) !== 0) {
         let neighborStone = move - this.gridSize;
         let neighborStoneGroupID = stoneGroupIDs[neighborStone];
         if (neighborStoneGroupID !== undefined) {
            this.#mergeGroups(stoneGroupIDs[move], neighborStoneGroupID, groupsByID, stoneGroupIDs);
         }
      }
      if (Math.floor(move / this.gridSize) !== this.gridSize - 1) {
         let neighborStone = move + this.gridSize;
         let neighborStoneGroupID = stoneGroupIDs[neighborStone];
         if (neighborStoneGroupID !== undefined) {
            this.#mergeGroups(stoneGroupIDs[move], neighborStoneGroupID, groupsByID, stoneGroupIDs);
         }
      }
   };
   #mergeGroups = (group1, group2, groupsByID, stoneGroupIDs) => {
      if (group1 === group2) {
         return;
      }
      let oldGroup, newGroup;
      let oldGroupID, newGroupID;
      if (group1 < group2) {
         oldGroup = groupsByID[group1];
         newGroup = groupsByID[group2];
         oldGroupID = group1;
         newGroupID = group2;
      } else {
         oldGroup = groupsByID[group2];
         newGroup = groupsByID[group1];
         oldGroupID = group2;
         newGroupID = group1;
      }
      for (let i = 0; i < oldGroup.length; ++i) {
         newGroup.push(oldGroup[i]);
         stoneGroupIDs[oldGroup[i]] = newGroupID;
      }
      delete groupsByID[oldGroupID];
   };
   #getEmptyNeighbour = (move) => {
      if (move % this.gridSize !== 0) {
         let neighborStone = move - 1;
         if (this.getPosition(neighborStone) === 0) {
            return neighborStone;
         }
      }
      if (move % this.gridSize !== this.gridSize - 1) {
         let neighborStone = move + 1;
         if (this.getPosition(neighborStone) === 0) {
            return neighborStone;
         }
      }
      if (Math.floor(move / this.gridSize) !== 0) {
         let neighborStone = move - this.gridSize;
         if (this.getPosition(neighborStone) === 0) {
            return neighborStone;
         }
      }
      if (Math.floor(move / this.gridSize) !== this.gridSize - 1) {
         let neighborStone = move + this.gridSize;
         if (this.getPosition(neighborStone) === 0) {
            return neighborStone;
         }
      }
      return -1;
   };
   #floodFillWorker = (move, value) => {
      this.#setPosition(move, value);
      let neighbourStone = this.#getEmptyNeighbour(move);
      while (neighbourStone !== -1) {
         this.#floodFillWorker(neighbourStone, value);
         neighbourStone = this.#getEmptyNeighbour(move);
      }
   };
   #resetGoBeforeFlood = () => {
      for (let i = 0; i < this.gridSize; i++) {
         for (let j = 0; j < this.gridSize; j++) {
            if (this.abstractBoard[i][j] !== 1 && this.abstractBoard[i][j] !== 2) {
               this.abstractBoard[i][j] = 0;
            }
         }
      }
   };
   #floodPlayer = (player) => {
      for (let move = 0; move < this.gridSize * this.gridSize; move++) {
         if (this.getPosition(move) === player) {
            let neighbourStone = this.#getEmptyNeighbour(move);
            while (neighbourStone > -1) {
               this.#floodFillWorker(neighbourStone, player + 2);
               neighbourStone = this.#getEmptyNeighbour(move);
            }
         }
      }
   };
   #getMovesForValue = (value) => {
      let result = [];
      for (let j = 0; j < this.gridSize; j++) {
         for (let i = 0; i < this.gridSize; i++) {
            if (this.abstractBoard[i][j] === value) {
               result.push(j * this.gridSize + i);
            }
         }
      }
      return result;
   };
   #getTerritories = () => {
      this.goTerritoryByPlayer = {1: [], 2: []};
      this.#resetGoBeforeFlood();
      this.#floodPlayer(1);
      let p1Territory = this.#getMovesForValue(3);
      this.#resetGoBeforeFlood();
      this.#floodPlayer(2);
      let p2Territory = this.#getMovesForValue(4);
      this.#resetGoBeforeFlood();
      let i = 0, j = 0;
      while (i < p1Territory.length && j < p2Territory.length) {
         let p1Stone = p1Territory[i], p2Stone = p2Territory[j];
         if (p1Stone === p2Stone) {
            p1Territory.splice(i, 1);
            p2Territory.splice(j, 1);
         } else {
            if (p1Stone < p2Stone) {
               i += 1;
            } else {
               j += 1;
            }
         }
      }
      this.goTerritoryByPlayer[1] = p1Territory;
      this.goTerritoryByPlayer[2] = p2Territory;
   };

   goScores = () => {
      this.#getTerritories();
      let score = {1: 0, 2: 0};
      for (let i = 0; i < this.gridSize; i++) {
         for (let j = 0; j < this.gridSize; j++) {
            const pos = this.abstractBoard[i][j];
            if (pos > 0) {
               score[pos] += 1;
            }
         }
      }
      for (let i = 1; i < 3; i++) {
         score[i] += this.goTerritoryByPlayer[i].length;
      }
      return score;
   };

   evaluateScore = () => {
      return this.isGo() && this.gameState.state === GameState.State.STARTED
         && this.gameState.goState === GameState.GoState.EVALUATE_STONES;
   };

   rejectGoState = () => {
      let pass = false;
      const pass_move = this.gridSize * this.gridSize;
      // console.log('moves = ', JSON.stringify(this.moves))
      for (let i = 0; i < this.moves.length; i++) {
         if (this.moves[i] === pass_move) {
            if (pass) {
               this.moves = this.moves.slice(0, i - 1);
               // const newMoves = this.moves.slice(0, i-1);
               // this.moves = newMoves;
               this.replayGame();
               break;
            } else {
               pass = true;
            }
         } else {
            pass = false;
         }
      }

   };

   #detectPenteCapture = (i, j, myColor) => {
      let opponentColor = 1 + (myColor % 2);
      if ((i - 3) > -1) {
         if (this.abstractBoard[i - 3][j] === myColor) {
            if ((this.abstractBoard[i - 1][j] === opponentColor) && (this.abstractBoard[i - 2][j] === opponentColor)) {
               this.abstractBoard[i - 1][j] = 0;
               this.abstractBoard[i - 2][j] = 0;
               this.captures[opponentColor] += 2;
            }
         }
      }
      if (((i - 3) > -1) && ((j - 3) > -1)) {
         if (this.abstractBoard[i - 3][j - 3] === myColor) {
            if ((this.abstractBoard[i - 1][j - 1] === opponentColor) && (this.abstractBoard[i - 2][j - 2] === opponentColor)) {
               this.abstractBoard[i - 1][j - 1] = 0;
               this.abstractBoard[i - 2][j - 2] = 0;
               this.captures[opponentColor] += 2;
            }
         }
      }
      if ((j - 3) > -1) {
         if (this.abstractBoard[i][j - 3] === myColor) {
            if ((this.abstractBoard[i][j - 1] === opponentColor) && (this.abstractBoard[i][j - 2] === opponentColor)) {
               this.abstractBoard[i][j - 1] = 0;
               this.abstractBoard[i][j - 2] = 0;
               this.captures[opponentColor] += 2;
            }
         }
      }
      if (((i + 3) < 19) && ((j - 3) > -1)) {
         if (this.abstractBoard[i + 3][j - 3] === myColor) {
            if ((this.abstractBoard[i + 1][j - 1] === opponentColor) && (this.abstractBoard[i + 2][j - 2] === opponentColor)) {
               this.abstractBoard[i + 1][j - 1] = 0;
               this.abstractBoard[i + 2][j - 2] = 0;
               this.captures[opponentColor] += 2;
            }
         }
      }
      if ((i + 3) < 19) {
         if (this.abstractBoard[i + 3][j] === myColor) {
            if ((this.abstractBoard[i + 1][j] === opponentColor) && (this.abstractBoard[i + 2][j] === opponentColor)) {
               this.abstractBoard[i + 1][j] = 0;
               this.abstractBoard[i + 2][j] = 0;
               this.captures[opponentColor] += 2;
            }
         }
      }
      if (((i + 3) < 19) && ((j + 3) < 19)) {
         if (this.abstractBoard[i + 3][j + 3] === myColor) {
            if ((this.abstractBoard[i + 1][j + 1] === opponentColor) && (this.abstractBoard[i + 2][j + 2] === opponentColor)) {
               this.abstractBoard[i + 1][j + 1] = 0;
               this.abstractBoard[i + 2][j + 2] = 0;
               this.captures[opponentColor] += 2;
            }
         }
      }
      if ((j + 3) < 19) {
         if (this.abstractBoard[i][j + 3] === myColor) {
            if ((this.abstractBoard[i][j + 1] === opponentColor) && (this.abstractBoard[i][j + 2] === opponentColor)) {
               this.abstractBoard[i][j + 1] = 0;
               this.abstractBoard[i][j + 2] = 0;
               this.captures[opponentColor] += 2;
            }
         }
      }
      if (((i - 3) > -1) && ((j + 3) < 19)) {
         if (this.abstractBoard[i - 3][j + 3] === myColor) {
            if ((this.abstractBoard[i - 1][j + 1] === opponentColor) && (this.abstractBoard[i - 2][j + 2] === opponentColor)) {
               this.abstractBoard[i - 1][j + 1] = 0;
               this.abstractBoard[i - 2][j + 2] = 0;
               this.captures[opponentColor] += 2;
            }
         }
      }
   };
   #detectKeryoPenteCapture = (i, j, myColor) => {
      let opponentColor = 1 + (myColor % 2);
      if ((i - 4) > -1) {
         if (this.abstractBoard[i - 4][j] === myColor) {
            if ((this.abstractBoard[i - 1][j] === opponentColor) && (this.abstractBoard[i - 2][j] === opponentColor) && (this.abstractBoard[i - 3][j] === opponentColor)) {
               this.abstractBoard[i - 1][j] = 0;
               this.abstractBoard[i - 2][j] = 0;
               this.abstractBoard[i - 3][j] = 0;
               this.captures[opponentColor] += 3;
            }
         }
      }
      if (((i - 4) > -1) && ((j - 4) > -1)) {
         if (this.abstractBoard[i - 4][j - 4] === myColor) {
            if ((this.abstractBoard[i - 1][j - 1] === opponentColor) && (this.abstractBoard[i - 2][j - 2] === opponentColor) && (this.abstractBoard[i - 3][j - 3] === opponentColor)) {
               this.abstractBoard[i - 1][j - 1] = 0;
               this.abstractBoard[i - 2][j - 2] = 0;
               this.abstractBoard[i - 3][j - 3] = 0;
               this.captures[opponentColor] += 3;
            }
         }
      }
      if ((j - 4) > -1) {
         if (this.abstractBoard[i][j - 4] === myColor) {
            if ((this.abstractBoard[i][j - 1] === opponentColor) && (this.abstractBoard[i][j - 2] === opponentColor) && (this.abstractBoard[i][j - 3] === opponentColor)) {
               this.abstractBoard[i][j - 1] = 0;
               this.abstractBoard[i][j - 2] = 0;
               this.abstractBoard[i][j - 3] = 0;
               this.captures[opponentColor] += 3;
            }
         }
      }
      if (((i + 4) < 19) && ((j - 4) > -1)) {
         if (this.abstractBoard[i + 4][j - 4] === myColor) {
            if ((this.abstractBoard[i + 1][j - 1] === opponentColor) && (this.abstractBoard[i + 2][j - 2] === opponentColor) && (this.abstractBoard[i + 3][j - 3] === opponentColor)) {
               this.abstractBoard[i + 1][j - 1] = 0;
               this.abstractBoard[i + 2][j - 2] = 0;
               this.abstractBoard[i + 3][j - 3] = 0;
               this.captures[opponentColor] += 3;
            }
         }
      }
      if ((i + 4) < 19) {
         if (this.abstractBoard[i + 4][j] === myColor) {
            if ((this.abstractBoard[i + 1][j] === opponentColor) && (this.abstractBoard[i + 2][j] === opponentColor) && (this.abstractBoard[i + 3][j] === opponentColor)) {
               this.abstractBoard[i + 1][j] = 0;
               this.abstractBoard[i + 2][j] = 0;
               this.abstractBoard[i + 3][j] = 0;
               this.captures[opponentColor] += 3;
            }
         }
      }
      if (((i + 4) < 19) && ((j + 4) < 19)) {
         if (this.abstractBoard[i + 4][j + 4] === myColor) {
            if ((this.abstractBoard[i + 1][j + 1] === opponentColor) && (this.abstractBoard[i + 2][j + 2] === opponentColor) && (this.abstractBoard[i + 3][j + 3] === opponentColor)) {
               this.abstractBoard[i + 1][j + 1] = 0;
               this.abstractBoard[i + 2][j + 2] = 0;
               this.abstractBoard[i + 3][j + 3] = 0;
               this.captures[opponentColor] += 3;
            }
         }
      }
      if ((j + 4) < 19) {
         if (this.abstractBoard[i][j + 4] === myColor) {
            if ((this.abstractBoard[i][j + 1] === opponentColor) && (this.abstractBoard[i][j + 2] === opponentColor) && (this.abstractBoard[i][j + 3] === opponentColor)) {
               this.abstractBoard[i][j + 1] = 0;
               this.abstractBoard[i][j + 2] = 0;
               this.abstractBoard[i][j + 3] = 0;
               this.captures[opponentColor] += 3;
            }
         }
      }
      if (((i - 4) > -1) && ((j + 4) < 19)) {
         if (this.abstractBoard[i - 4][j + 4] === myColor) {
            if ((this.abstractBoard[i - 1][j + 1] === opponentColor) && (this.abstractBoard[i - 2][j + 2] === opponentColor) && (this.abstractBoard[i - 3][j + 3] === opponentColor)) {
               this.abstractBoard[i - 1][j + 1] = 0;
               this.abstractBoard[i - 2][j + 2] = 0;
               this.abstractBoard[i - 3][j + 3] = 0;
               this.captures[opponentColor] += 3;
            }
         }
      }
   };
   #detectPoof = (i, j, myColor) => {
      let opponentColor = 1 + (myColor % 2);
      let poofed = false;
      if (((i - 2) > -1) && ((i + 1) < 19)) {
         if (this.abstractBoard[i - 1][j] === myColor) {
            if ((this.abstractBoard[i - 2][j] === opponentColor) && (this.abstractBoard[i + 1][j] === opponentColor)) {
               this.abstractBoard[i - 1][j] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 1;
               poofed = true;
            }
         }
      }
      if (((i - 2) > -1) && ((j - 2) > -1) && ((i + 1) < 19) && ((j + 1) < 19)) {
         if (this.abstractBoard[i - 1][j - 1] === myColor) {
            if ((this.abstractBoard[i - 2][j - 2] === opponentColor) && (this.abstractBoard[i + 1][j + 1] === opponentColor)) {
               this.abstractBoard[i - 1][j - 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 1;
               poofed = true;
            }
         }
      }
      if (((j - 2) > -1) && ((j + 1) < 19)) {
         if (this.abstractBoard[i][j - 1] === myColor) {
            if ((this.abstractBoard[i][j - 2] === opponentColor) && (this.abstractBoard[i][j + 1] === opponentColor)) {
               this.abstractBoard[i][j - 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 1;
               poofed = true;
            }
         }
      }
      if (((i - 1) > -1) && ((j - 2) > -1) && ((i + 2) < 19) && ((j + 1) < 19)) {
         if (this.abstractBoard[i + 1][j - 1] === myColor) {
            if ((this.abstractBoard[i - 1][j + 1] === opponentColor) && (this.abstractBoard[i + 2][j - 2] === opponentColor)) {
               this.abstractBoard[i + 1][j - 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 1;
               poofed = true;
            }
         }
      }
      if (((i + 2) < 19) && ((i - 1) > -1)) {
         if (this.abstractBoard[i + 1][j] === myColor) {
            if ((this.abstractBoard[i + 2][j] === opponentColor) && (this.abstractBoard[i - 1][j] === opponentColor)) {
               this.abstractBoard[i + 1][j] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 1;
               poofed = true;
            }
         }
      }
      if (((i - 1) > -1) && ((j - 1) > -1) && ((i + 2) < 19) && ((j + 2) < 19)) {
         if (this.abstractBoard[i + 1][j + 1] === myColor) {
            if ((this.abstractBoard[i - 1][j - 1] === opponentColor) && (this.abstractBoard[i + 2][j + 2] === opponentColor)) {
               this.abstractBoard[i + 1][j + 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 1;
               poofed = true;
            }
         }
      }
      if (((j + 2) < 19) && ((j - 1) > -1)) {
         if (this.abstractBoard[i][j + 1] === myColor) {
            if ((this.abstractBoard[i][j - 1] === opponentColor) && (this.abstractBoard[i][j + 2] === opponentColor)) {
               this.abstractBoard[i][j + 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 1;
               poofed = true;
            }
         }
      }
      if (((i - 2) > -1) && ((j - 1) > -1) && ((i + 1) < 19) && ((j + 2) < 19)) {
         if (this.abstractBoard[i - 1][j + 1] === myColor) {
            if ((this.abstractBoard[i + 1][j - 1] === opponentColor) && (this.abstractBoard[i - 2][j + 2] === opponentColor)) {
               this.abstractBoard[i - 1][j + 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 1;
               poofed = true;
            }
         }
      }
      if (poofed) {
         this.captures[myColor] += 1;
      }
   };

   #detectKeryoPoof = (i, j, myColor) => {
      let opponentColor = 1 + (myColor % 2);
      let poofed = false;
      if (((i - 3) > -1) && ((i + 1) < 19)) { // left
         if (this.abstractBoard[i - 1][j] === myColor && this.abstractBoard[i - 2][j] === myColor) {
            if ((this.abstractBoard[i - 3][j] === opponentColor) && (this.abstractBoard[i + 1][j] === opponentColor)) {
               this.abstractBoard[i - 2][j] = 0;
               this.abstractBoard[i - 1][j] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((i - 3) > -1) && ((j - 3) > -1) && ((i + 1) < 19) && ((j + 1) < 19)) { // up left
         if (this.abstractBoard[i - 1][j - 1] === myColor && this.abstractBoard[i - 2][j - 2] === myColor) {
            if ((this.abstractBoard[i - 3][j - 3] === opponentColor) && (this.abstractBoard[i + 1][j + 1] === opponentColor)) {
               this.abstractBoard[i - 2][j - 2] = 0;
               this.abstractBoard[i - 1][j - 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((j - 3) > -1) && ((j + 1) < 19)) { // up
         if (this.abstractBoard[i][j - 1] === myColor && this.abstractBoard[i][j - 2] === myColor) {
            if ((this.abstractBoard[i][j - 3] === opponentColor) && (this.abstractBoard[i][j + 1] === opponentColor)) {
               this.abstractBoard[i][j - 2] = 0;
               this.abstractBoard[i][j - 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((i - 1) > -1) && ((j - 3) > -1) && ((i + 3) < 19) && ((j + 1) < 19)) { // up right
         if (this.abstractBoard[i + 1][j - 1] === myColor && this.abstractBoard[i + 2][j - 2] === myColor) {
            if ((this.abstractBoard[i - 1][j + 1] === opponentColor) && (this.abstractBoard[i + 3][j - 3] === opponentColor)) {
               this.abstractBoard[i + 2][j - 2] = 0;
               this.abstractBoard[i + 1][j - 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((i + 3) < 19) && ((i - 1) > -1)) { // right
         if (this.abstractBoard[i + 1][j] === myColor && this.abstractBoard[i + 2][j] === myColor) {
            if ((this.abstractBoard[i + 3][j] === opponentColor) && (this.abstractBoard[i - 1][j] === opponentColor)) {
               this.abstractBoard[i + 2][j] = 0;
               this.abstractBoard[i + 1][j] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((i - 1) > -1) && ((j - 1) > -1) && ((i + 3) < 19) && ((j + 3) < 19)) { // down right
         if (this.abstractBoard[i + 1][j + 1] === myColor && this.abstractBoard[i + 2][j + 2] === myColor) {
            if ((this.abstractBoard[i - 1][j - 1] === opponentColor) && (this.abstractBoard[i + 3][j + 3] === opponentColor)) {
               this.abstractBoard[i + 2][j + 2] = 0;
               this.abstractBoard[i + 1][j + 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((j + 2) < 19) && ((j - 1) > -1)) { // down
         if (this.abstractBoard[i][j + 1] === myColor && this.abstractBoard[i][j + 2] === myColor) {
            if ((this.abstractBoard[i][j - 1] === opponentColor) && (this.abstractBoard[i][j + 3] === opponentColor)) {
               this.abstractBoard[i][j + 1] = 0;
               this.abstractBoard[i][j + 2] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((i - 3) > -1) && ((j - 1) > -1) && ((i + 1) < 19) && ((j + 3) < 19)) { // down left
         if (this.abstractBoard[i - 1][j + 1] === myColor && this.abstractBoard[i - 2][j + 2] === myColor) {
            if ((this.abstractBoard[i + 1][j - 1] === opponentColor) && (this.abstractBoard[i - 3][j + 3] === opponentColor)) {
               this.abstractBoard[i - 2][j + 2] = 0;
               this.abstractBoard[i - 1][j + 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }

      // 4 directions with center of 3 stones placed to poof
      if (((i - 2) > -1) && ((i + 2) < 19)) { // horizontal
         if (this.abstractBoard[i - 1][j] === myColor && this.abstractBoard[i + 1][j] === myColor) {
            if ((this.abstractBoard[i - 2][j] === opponentColor) && (this.abstractBoard[i + 2][j] === opponentColor)) {
               this.abstractBoard[i + 1][j] = 0;
               this.abstractBoard[i - 1][j] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((i - 2) > -1) && ((j - 2) > -1) && ((i + 2) < 19) && ((j + 2) < 19)) { // up left
         if (this.abstractBoard[i - 1][j - 1] === myColor && this.abstractBoard[i + 1][j + 1] === myColor) {
            if ((this.abstractBoard[i - 2][j - 2] === opponentColor) && (this.abstractBoard[i + 2][j + 2] === opponentColor)) {
               this.abstractBoard[i + 1][j + 1] = 0;
               this.abstractBoard[i - 1][j - 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((j - 2) > -1) && ((j + 2) < 19)) { // vertical
         if (this.abstractBoard[i][j - 1] === myColor && this.abstractBoard[i][j + 1] === myColor) {
            if ((this.abstractBoard[i][j - 2] === opponentColor) && (this.abstractBoard[i][j + 2] === opponentColor)) {
               this.abstractBoard[i][j + 1] = 0;
               this.abstractBoard[i][j - 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }
      if (((i - 2) > -1) && ((j - 2) > -1) && ((i + 2) < 19) && ((j + 2) < 19)) { // up right
         if (this.abstractBoard[i + 1][j - 1] === myColor && this.abstractBoard[i - 1][j + 1] === myColor) {
            if ((this.abstractBoard[i - 2][j + 2] === opponentColor) && (this.abstractBoard[i + 2][j - 2] === opponentColor)) {
               this.abstractBoard[i + 1][j - 1] = 0;
               this.abstractBoard[i - 1][j + 1] = 0;
               this.abstractBoard[i][j] = 0;
               this.captures[myColor] += 2;
               poofed = true;
            }
         }
      }

      if (poofed) {
         this.captures[myColor] += 1;
      }

   }
}

export function useInterval(callback, delay) {
   const savedCallback = useRef();

   useEffect(() => {
      savedCallback.current = callback;
   });

   useEffect(() => {
      function tick() {
         savedCallback.current();
      }

      let id = setInterval(tick, delay);
      return () => clearInterval(id);
   }, [delay]);
}