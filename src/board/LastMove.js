import React from 'react';

function LastMove(props) {
   return (
      <svg key={'last_move'} height={props.size} width={props.size}>
         <circle cx={props.size / 2} cy={props.size / 2} r={props.size / 5}
                 fill={"#ff0000"} pointerEvents={'none'}/>
      </svg>
   );
}

export default LastMove;