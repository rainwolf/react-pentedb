import React from 'react';

function Territory(props) {
   return (
      <svg key={'territory'} height={props.size} width={props.size}>
         <rect x={3} y={3} width={4} height={4}
               fill={props.id === 1 ? '#000000' : '#ffffff'}
               pointerEvents={'none'}
         />
      </svg>
   );
}

export default Territory;