import {useReducer} from 'react';
import BoardSquare from './BoardSquare';
import {GameState, Game} from '../game/GameClass';
import PropTypes from 'prop-types';
import {gridSizeForGame, boardStyleClass, boardSpecialPoints} from './boardGeometry';
import {renjuOpeningUiReducer, INITIAL as RENJU_UI_INITIAL, renjuTogglePick, renjuMarkPending} from './renjuOpeningUi';
import {RenjuPhase, isRenjuSelection} from '../game/openingPhase';
import {renjuStabilizer, isOfferDup} from './renjuSymmetry';

// --- coupling severed from react_live_game_room's connected Board ---
// Removed: react-redux connect()/mapStateToProps/mapDispatchToProps, TableClass, the
// redux-websocket send_message action, and the wire-protocol Commands builder — all live-room
// server-communication concerns (see board-rules-contract.md §1-§2). In their place:
//   - `gameId` / `myTurn` are now plain props supplied by the caller (previously derived from a
//     live `table` object via `table.game` / `table.isMyTurn(game) && started`).
//   - `renjuUi` (mode/picks) is now owned locally via useReducer over the SAME, unmodified
//     `renjuOpeningUiReducer` — zero behavior change, only the wiring (redux slice -> local hook).
//   - `onMove`/`onRenjuDecline`/`onRenjuSelect`/`onRenjuOffer10` are callback props the caller wires
//     to whatever it wants (local move application, a store, etc.) instead of building and sending
//     a websocket Commands.* message. The `draw_armed` wire-payload flag is dropped here (dead
//     branch belonging to the removed wire-protocol call) — callers that need it can fold it into
//     their own onMove handler.
// All rendering / click-gating logic below (makeBoard, makeCoordinateBoundaries, JSX) is otherwise
// UNCHANGED from the source component.

const Board = (props) => {

   const {game, gameId: game_id, myTurn, onMove, onRenjuDecline, onRenjuSelect, onRenjuOffer10} = props;

   const [renjuUi, dispatchRenjuUi] = useReducer(renjuOpeningUiReducer, RENJU_UI_INITIAL);
   const togglePick = (move) => dispatchRenjuUi(renjuTogglePick(move));
   const markPending = () => dispatchRenjuUi(renjuMarkPending());

   const sendMove = (move) => {
      onMove(move);
   };

   // Each opening decision is SENT then the UI goes 'pending' — we do NOT mutate the board or
   // re-open the modal locally; the stone/seat/phase only change when the caller applies the move.
   const sendRenjuDecline = (move) => {
      onRenjuDecline(move);
      markPending();
   };
   const sendRenjuSelect = (move) => {
      onRenjuSelect(move);
      markPending();
   };
   const sendRenjuOffer10 = (moves) => {
      onRenjuOffer10(moves);
      markPending();
   };

   // console.log(JSON.stringify(game.abstractBoard))

   const makeBoard = (gridsize) => {
      if (game === undefined) {
         return [];
      }
      let board = [];
      let player_colors = [undefined, 'white-stone-gradient', 'black-stone-gradient'];
      if (game.isGo()) {
         player_colors = [undefined, 'black-stone-gradient', 'white-stone-gradient'];
      }
      let hover = player_colors[game.currentColor()];
      if (game.isGo() && game.gameState.goState === GameState.GoState.MARK_STONES) {
         hover = 'red-stone-gradient';
      }
      const started = game.gameState.state === GameState.State.STARTED;
      // console.log('my turn: ', myTurn);
      // console.log('makeBoard');
      // --- renju (Taraguchi-10) opening context, computed once before the cell loop ---
      const isRenju = game.isRenjuGame && game.isRenjuGame();
      const renjuPhaseNow = isRenju ? game.renjuPhaseNow() : null;
      const boxRadius = isRenju ? game.renjuBoxRadius() : 0;
      const size = gridsize;
      const center = Math.floor(size / 2);
      const inBox = (m) => {
         if (boxRadius === 0) return true;
         const x = m % size, y = Math.floor(m / size);
         return Math.abs(x - center) <= boxRadius && Math.abs(y - center) <= boxRadius;
      };
      const picks = (isRenju && renjuUi.mode === 'offering') ? renjuUi.picks : [];
      const offers = (isRenju && renjuPhaseNow === RenjuPhase.SELECTION) ? game.gameState.renjuState.offered : [];
      // offer-symmetry pre-check: the stabilizer of the CURRENT placed position, computed once per
      // render, mirroring the server/JSP — so only genuine symmetric (or exact) duplicates are
      // blocked, never arbitrary rotations on an asymmetric board.
      const valueAt = (q) => game.abstractBoard[q % size][Math.floor(q / size)];
      const offerStab = (isRenju && renjuUi.mode === 'offering') ? renjuStabilizer(valueAt, size) : [];
      // Build the already-picked Set ONCE per render (alongside offerStab) instead of letting
      // isOfferDup rebuild it for every empty cell (~200 cells/render). Passed into isOfferDup below.
      const picksSet = new Set(picks);
      for (let j = 0; j < gridsize; j++) {
         for (let i = 0; i < gridsize; i++) {
            const m = j * gridsize + i;
            let squaretype;
            if (m === 0) {
               squaretype = 1;
            } else if (m === gridsize - 1) {
               squaretype = 3;
            } else if (m === gridsize * gridsize - 1) {
               squaretype = 9;
            } else if (m === gridsize * (gridsize - 1)) {
               squaretype = 7;
            } else if (j === 0) {
               // } else if (Math.floor(m / gridsize) === 0) {
               squaretype = 2;
            } else if (j === gridsize - 1) {
               // } else if (Math.floor(m / gridsize) === gridsize - 1) {
               squaretype = 8;
               // } else if (m % gridsize === 0) {
            } else if (i === 0) {
               squaretype = 4;
               // } else if (m % gridsize === gridsize - 1) {
            } else if (i === gridsize - 1) {
               squaretype = 6;
            } else {
               squaretype = 5;
            }

            const stone = player_colors[game.abstractBoard[i][j]];
            const empty = game.abstractBoard[i][j] === 0;
            let clickHandler = undefined;
            if (myTurn) {
               if (isRenju && renjuUi.mode === 'pending') {
                  // a decision was just sent; the board stays inert until the caller applies it
               } else if (isRenju && renjuUi.mode === 'placing') {
                  // decline + box-constrained Branch-A / window stone
                  if (empty && inBox(m)) clickHandler = () => sendRenjuDecline(m);
               } else if (isRenju && renjuUi.mode === 'offering') {
                  // Branch-B 10-pick. Re-tap an existing candidate to remove it; tap a new empty,
                  // non-symmetric point to add it. Placing the 10th candidate AUTO-SENDS the offer
                  // (no separate submit) — so the count can never exceed 10.
                  if (renjuUi.picks.includes(m)) {
                     clickHandler = () => togglePick(m);
                  } else if (empty && !isOfferDup(m, picksSet, offerStab, size)) {
                     clickHandler = renjuUi.picks.length >= 9
                        ? () => sendRenjuOffer10([...renjuUi.picks, m])
                        : () => togglePick(m);
                  }
               } else if (isRenju && isRenjuSelection(game.moves.length, game.gameState.renjuState, started)) {
                  // white selects one of the ten offered candidates
                  if (offers.includes(m)) clickHandler = () => sendRenjuSelect(m);
               } else if (isRenju && game.gameState.renjuState.selected != null && game.moves.length === 4) {
                  // Branch-B gap: white's fifth-move is selected (select1 echo in) but the move-5
                  // event hasn't landed yet (numMoves still 4, phase reads MOVE). Keep the
                  // board inert — like the SWAP/BRANCH decision-pending arm — so black's normal-move
                  // handler can't transiently fire. (placed AFTER the SELECTION branch, which needs
                  // selected==null, so it can never shadow it.)
               } else if (isRenju && (renjuPhaseNow === RenjuPhase.SWAP || renjuPhaseNow === RenjuPhase.BRANCH)) {
                  // a decision modal is up; the board is inert until a choice is armed
                  clickHandler = undefined;
               } else if (empty && (!isRenju || inBox(m))) {
                  // normal move (incl. renju MOVE/COMPLETE, box-constrained for opening moves 2-5)
                  clickHandler = sendMove;
               }
               if (game.isGo() && game.gameState.goState === GameState.GoState.MARK_STONES) {
                  if (clickHandler === undefined) {
                     clickHandler = sendMove;
                  } else {
                     clickHandler = undefined;
                  }
               }
            }
            board.push({
               key: m, gridsize: gridsize, id: m,
               part: squaretype, stone: stone,
               clickHandler: clickHandler,
               hover: hover
            });
         }
      }
      if (game.isGo() && game.gameState.goState > GameState.GoState.PLAY) {
         for (let i = 1; i < 3; i++) {
            game.goDeadStonesByPlayer[i].forEach(s => {
               board[s].deadStone = player_colors[i];
            });
         }
         for (let i = 1; i < 3; i++) {
            // console.log(JSON.stringify(game.goTerritoryByPlayer[i]))
            game.goTerritoryByPlayer[i].forEach(s => {
               board[s].territory = i;
            });
         }
      }
      boardSpecialPoints(game_id).forEach(({index, part}) => {
         board[index].part = part;
      });
      const lastMoves = game.last_move();
      lastMoves.forEach(move => {
         if (move !== undefined) {
            board[move].last_move = true;
         }
      });
      if (isRenju) {
         // translucent black candidates: the in-progress 10-pick (offering) or the ten offers
         // awaiting white's selection. player_colors[2] === 'black-stone-gradient'.
         const blackTranslucent = player_colors[2];
         picks.forEach((s) => { if (board[s]) board[s].deadStone = blackTranslucent; });
         offers.forEach((s) => { if (board[s]) board[s].deadStone = blackTranslucent; });
         // NOTE: the legal placement box is still enforced via the clickHandler gating (inBox);
         // we intentionally do NOT draw a visual box highlight (per UX preference).
      }

      return board.map(p => <BoardSquare {...p}/>);
   };
   const makeCoordinateBoundaries = (gridsize) => {
      const coordinateLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
      let coordinates = [];
      for (let i = 1; i <= gridsize; i++) {
         coordinates.push(
            <text key={i} y={1} fontSize={4} transform={'translate(0,' + (10 * i) + ')'}>
               {gridsize - i + 1}
            </text>
         );
         coordinates.push(
            <text key={coordinateLetters[i] + i} y={4} fontSize={4} transform={'translate(' + (10 * i) + ',0)'}>
               {coordinateLetters[i - 1]}
            </text>
         )
      }
      return coordinates;
   };

   const style = boardStyleClass(game_id);
   const gridsize = gridSizeForGame(game_id);
   return (
      <svg id="svgboard" height={'100%'} viewBox={'0 0 ' + (10 * (gridsize + 1)) + ' ' + (10 * (gridsize + 1))}>
         <g id={'whole'} transform={'translate(5,5)'}>
            <g id="boardgroup" transform={'scale(0.95, 0.95) translate(5,5)'}>
               <filter id="f3" x="0" y="0" width="150%" height="150%">
                  <feOffset result="offOut" in="SourceAlpha" dx={4} dy={4}/>
                  <feGaussianBlur result="blurOut" in="offOut" stdDeviation="3"/>
                  <feBlend in="SourceGraphic" in2="blurOut" mode="normal"/>
               </filter>
               <rect height={10 * gridsize} width={10 * gridsize} filter={"url(#f3)"} className={'board ' + style}/>
               {makeBoard(gridsize)}
            </g>
            <g id="coordinates" transform={'scale(0.95, 0.95)'}>
               {makeCoordinateBoundaries(gridsize)}
            </g>
         </g>
      </svg>
   );
};

Board.propTypes = {
   game: PropTypes.instanceOf(Game).isRequired,
   gameId: PropTypes.number.isRequired,
   myTurn: PropTypes.bool,
   onMove: PropTypes.func,
   onRenjuDecline: PropTypes.func,
   onRenjuSelect: PropTypes.func,
   onRenjuOffer10: PropTypes.func,
};

Board.defaultProps = {
   myTurn: false,
   onMove: () => {},
   onRenjuDecline: () => {},
   onRenjuSelect: () => {},
   onRenjuOffer10: () => {},
};

export default Board;
