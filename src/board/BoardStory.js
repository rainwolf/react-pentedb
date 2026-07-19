import React from 'react';
import Board from './Board';
import {Game, GameState} from '../game/GameClass';
import '../resources/board.css';

// Temporary render-smoke scaffolding for P2 Task 2 Step 4 — NOT part of the
// severed board+rules API surface. Builds a pente game (variant id 1, 19x19)
// with a handful of stones placed via the real addMove() rules path, then
// renders <Board> standalone (no redux/websocket) to visually confirm the
// copy-adapt: grid, hoshi points, and stones all render intact.
function buildDemoGame() {
   const g = new Game();
   g.setGame(1); // pente, 19x19
   g.gameState = {
      ...g.gameState,
      state: GameState.State.STARTED,
   };
   const gridSize = g.gridSize;
   const center = Math.floor(gridSize / 2);
   const moves = [
      center * gridSize + center,           // move 1 (black) - center
      center * gridSize + (center + 1),     // move 2 (white)
      (center - 1) * gridSize + center,     // move 3 (black)
      (center + 1) * gridSize + (center + 2), // move 4 (white)
      (center - 2) * gridSize + (center - 1), // move 5 (black)
   ];
   moves.forEach((m) => g.addMove(m));
   return g;
}

const BoardStory = () => {
   const game = buildDemoGame();
   return (
      <div style={{width: '640px', height: '640px', margin: '2rem auto'}}>
         <Board
            game={game}
            gameId={1}
            myTurn={false}
            onMove={() => {}}
            onRenjuDecline={() => {}}
            onRenjuSelect={() => {}}
            onRenjuOffer10={() => {}}
         />
      </div>
   );
};

export default BoardStory;
