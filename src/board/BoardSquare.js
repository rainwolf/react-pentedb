import React, {Component} from 'react';
import Stone from './Stone';
import Territory from './Territory';
import LastMove from './LastMove';
import SimpleStone from "./SimpleStone";

class BoardSquare extends Component {

   constructor(props) {
      super(props);
      this.state = {showStone: false};
   }

   up = (size, transform) => {
      return (
         <line key={this.props.id + transform} className='boardline' x1={size / 2} y1={size / 2}
               x2={size / 2} y2={0}
               transform={transform}
         />
      )
   };
   left = (size) => {
      return this.up(size, 'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')')
   };
   right = (size) => {
      return this.up(size, 'rotate(90 ' + (size / 2) + ' ' + (size / 2) + ')')
   };
   down = (size) => {
      return this.up(size, 'rotate(180 ' + (size / 2) + ' ' + (size / 2) + ')')
   };
   cross = (size) => {
      return ([this.up(size), this.left(size), this.right(size), this.down(size)])
   };
   topside = (size) => {
      return ([this.left(size), this.right(size), this.down(size)])
   };
   bottomside = (size) => {
      return ([this.up(size), this.left(size), this.right(size)])
   };
   leftside = (size) => {
      return ([this.up(size), this.right(size), this.down(size)])
   };
   rightside = (size) => {
      return ([this.up(size), this.left(size), this.down(size)])
   };
   upperleftcorner = (size) => {
      return ([this.right(size), this.down(size)])
   };
   upperrightcorner = (size) => {
      return ([this.left(size), this.down(size)])
   };
   bottomleftcorner = (size) => {
      return ([this.up(size), this.right(size)])
   };
   bottomrightcorner = (size) => {
      return ([this.up(size), this.left(size)])
   };
   crosscircle = (size) => {
      return ([<circle className='boardcircle' key={this.props.id + 'circle'}
                       cx={size / 2} cy={size / 2} r={size / 5} fill='none'/>,
         this.up(size), this.left(size), this.right(size), this.down(size)])
   };
   crossdot = (size) => {
      return ([this.up(size), this.left(size), this.right(size), this.down(size),
         <circle className='boarddot' key={this.props.id + 'dot'} cx={size / 2} cy={size / 2} r={size / 20}/>])
   };
   boardpart = (size) => {
      switch (this.props.part) {
         case 1:
            return this.upperleftcorner(size);
         case 2:
            return this.topside(size);
         case 3:
            return this.upperrightcorner(size);
         case 4:
            return this.leftside(size);
         case 5:
            return this.cross(size);
         case 51:
            return this.crosscircle(size);
         case 52:
            return this.crossdot(size);
         case 6:
            return this.rightside(size);
         case 7:
            return this.bottomleftcorner(size);
         case 8:
            return this.bottomside(size);
         default:
            return this.bottomrightcorner(size);
      }
   };
   enterHandler = (e) => {
      if (this.props.clickHandler === undefined) {
         return;
      }
      this.setState({showStone: true});
   };
   exitHandler = (e) => {
      this.setState({showStone: false});
   };
   clickHandler = (e) => {
      if (this.props.clickHandler === undefined) {
         return;
      }
      let id = e.target.id;
      id = id.replace(/"/g, '');
      this.props.clickHandler(id);
      this.setState({showStone: false});
   };


   render() {
      const gridsize = this.props.gridsize,
         size = 10,
         y = 10 * Math.floor(parseInt(this.props.id) / gridsize),
         x = 10 * (parseInt(this.props.id) % gridsize);
      return (
         <g key={'square' + this.props.id} viewBox={'0 0 15 15'}
            height={size * 1.5} width={size * 1.5}
            onMouseEnter={this.enterHandler}
            onMouseLeave={this.exitHandler}
            onClick={this.clickHandler}
            transform={'translate(' + x + ',' + y + ')'}
         >
            <rect id={"\"" + this.props.id + "\""} width={size} height={size}
                  fillOpacity={0.0} pointerEvents={'all'}/>
            {this.boardpart(size)}
            {this.props.stone && Stone({size: 10, id: this.props.stone})}
            {this.props.deadStone && SimpleStone({size: 10, id: this.props.deadStone, opacity: 0.6})}
            {this.props.territory && Territory({size: 10, id: this.props.territory})}
            {this.state.showStone && SimpleStone({size: 10, id: this.props.hover, opacity: 0.7})}
            {this.props.last_move && LastMove({size: 10})}
         </g>
      );
   }
};

export default BoardSquare;