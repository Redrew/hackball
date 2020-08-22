const _ = require("lodash");
const { Circle, Vec2 } = require("./math");

const PACK = {
  x: 0,
  y: 1,
  r: 2,
  type: 3,
};

// x, y, r, 0b___btt
const SIZE = 6;
class Body {
  constructor(circle, v) {
    this.circle = circle;
    this.v = v || new Vec2();
    this.prevVel = this.v;
    this.arraySize = SIZE;
  }
  init() {}
  update(game) {
    //Updates previous velocity
    this.prevVel = this.v;

  }
  collide(obj) {}
}

Body.TYPES = {
  PLAYER: 0,
  BALL: 1,
  CIVILIAN: 2,
  MEDIC: 3,
  JACINDA: 4,
};

class PlayerBody extends Body {
  constructor(circle, v) {
    super(circle, v);
    this.flags = 0;
    this.type = Body.TYPES.PLAYER;
    this.speed = 1;
    this.throwDirection = new Vec2(1, 0); // in radians
    this.ball = null;
    this.throwSpeed = 13;

    // Sent to client
    this.team = 0;
    this.wearingMask = false;
    this.caughtCorona = false;
    this.hasBall = false;
    this.pickUp = false;
    this.throwing = false;
  }

  update(game) {
    super.update(game);
    // Unpack flags
    if (this.hasBall && this.throwing) {
      this.throw();
    }
    this.throwing = false;
  }

  throw() {
    const r = this.circle.r,
      ballr = this.ball.circle.r;
    const spawnDistance = r + ballr;
    var spawnLocation = this.circle
      .clone()
      .add(new Vec2(r - ballr, r - ballr))
      .add(this.throwDirection, spawnDistance);
    this.ball.circle.xy = spawnLocation.xy;
    this.ball.v = this.throwDirection.clone().mul(this.throwSpeed);
    this.ball.team = this.team;
    this.ball.pickedUp = false;
    this.ball = null;
    this.hasBall = false;
  }
  toArray() {
    const array = new Float32Array(this.arraySize);
    array.fill(0);
    const fillin = [this.circle.x, this.circle.y, this.circle.r, this.type];
    array.set(fillin);
    const encoded = encodeBoolArray([
      this.team,
      this.hasBall,
      this.pickUp,
      this.throwing,
    ]);
    array.set(encoded, fillin.length);
    return array;
  }
  static fromArray(pack) {
    const obj = new this(new Circle(pack[PACK.x], pack[PACK.y], pack[PACK.r]));
    const subpack = pack.slice(4);
    [obj.team, obj.hasBall, obj.pickUp, obj.throwing] = decodeNumArray(
      subpack,
      4
    );
    return obj;
  }

  collide(entity) {
    let circle = entity.body.circle,
      v = entity.body.v,
      dist = entity.body.circle.distance(this.circle),
      vx = (circle.x - this.circle.x) / dist,
      vy = (circle.y - this.circle.y) / dist,
      isBall = entity.body.type === Body.TYPES.BALL,
      isMoving = isBall && entity.body.moving,
      isCivilian = entity.body.type === Body.TYPES.CIVILIAN,
      isMedic = entity.body.type === Body.TYPES.MEDIC,
      isJacinda = entity.body.type === Body.TYPES.JACINDA;

    // collision between player and ball on floor
    if (isBall && !isMoving) {
      // pick up corona
      // if (this.hasBall === entity || !this.hasBall)
      if (!this.hasBall) {
        this.ball = entity.body;
        this.hasBall = true;
        entity.body.pickedUp = true;
        entity.body.team = this.team;
        circle.x = this.circle.x;
        circle.y = this.circle.y;
        v.x = this.v.x;
        v.y = this.v.y;
        // not sure what the following does
        // vx *= 8;
        // vy *= 8;
      }
    }

    // collision between player and moving ball
    if (isBall && isMoving) {
      // if player has ball or already caught corona, nothing happens
      // otherwise, they catch corona
      if (!this.hasBall && !this.caughtCorona) {
        this.caughtCorona = true;
        // ball is no longer moving
        entity.body.moving = false;
        // ball is on the floor again with no team
        let ballTeam = entity.body.team;
        entity.body.team = null;
        console.log("ball team is not meant to be null:", ballTeam);
        // return the ball's team to updatePhysics for scoreboard update
        return ballTeam;
      }
    }

    // collision between player and players
    if (!isBall) {
      // to be implemented along with roles
    }
  }
}

class BallBody extends Body {
  constructor(circle, id, v) {
    super(circle, v);
    this.type = Body.TYPES.BALL;
    this.id = id;
    this.pickedUp = false;

    // Sent to client
    this.team = null;
    this.moving = false;
  }

  update(game) {
    if (this.moving && this.v.length < 0.1) {
      this.moving = false;
      this.team = null;
    }
    if (this.team != null && this.v.length > 0.1) {
      this.moving = true;
    }
  }
  toArray() {
    const array = new Float32Array(this.arraySize);
    array.fill(0);
    const fillin = [this.circle.x, this.circle.y, this.circle.r, this.type];
    array.set(fillin);
    const encoded = encodeBoolArray([this.team, this.moving]);
    array.set(encoded, fillin.length);
    return array;
  }
  static fromArray(pack) {
    const obj = new this(new Circle(pack[PACK.x], pack[PACK.y], pack[PACK.r]));
    const subpack = pack.slice(4);
    [obj.team, obj.moving] = decodeNumArray(subpack, 2);
    return obj;
  }

  collide(entity) {
    let circle = entity.body.circle,
      entVel = entity.body.prevVel,
      dist = entity.body.circle.distance(this.circle),
      xDist = (this.circle.x- circle.x),
      yDist = (this.circle.y - circle.y),
      isBall = entity.body.type === Body.TYPES.BALL,
      isMoving = isBall && entity.body.moving,
      isCivilian = entity.body.type === Body.TYPES.CIVILIAN,
      isMedic = entity.body.type === Body.TYPES.MEDIC,
      isJacinda = entity.body.type === Body.TYPES.JACINDA;

    // collide between ball and ball
    if (isBall) {
      // balls roll away, both balls becomes non-moving and ready for pickup

      //Ball bounces off code
      impulseDir = new Vec2(xDist, yDist).normalize();
      impulse = impulseDir.clone().mulScal(this.v.add(entVel, -1.0).dotP(impulseDir));
      this.v.add(impulse, 1.0);

      //Loss of vel in collision
      this.v.mulScal(0.8);
      
      
      //Turned off, can be changed
      //this.moving = false;
      this.pickedUp = false;
      this.team = null;
      entity.body.moving = false;
      entity.body.pickedUp = false;
      entity.team = null;
    }

    // no need to check for collision between ball and player,
    // already done in collide() in PlayerBody
  }
}

class CivilianBody extends PlayerBody {
  constructor(circle, v) {
    super(circle, v);
    this.type = Body.TYPES.CIVILIAN;

    // Sent to client
    this.wearingMask = false;
  }
  /**
   * attach coronavirus to player
   * @param {BoardBody} ball
   */
  _pickupCorona(ball) {
    // to be implemented
  }

  /**
   * throws coronavirus at target position coord
   * @param {Vec2} targetPosition
   */
  _throwCorona(targetPosition) {
    // to be implemented
  }

  toArray() {
    const array = new Float32Array(this.arraySize);
    array.fill(0);
    const fillin = [this.circle.x, this.circle.y, this.circle.r, this.type];
    array.set(fillin);
    const encoded = encodeBoolArray([
      this.team,
      this.hasBall,
      this.pickUp,
      this.throwing,
      this.wearingMask,
    ]);
    array.set(encoded, fillin.length);
    return array;
  }
  static fromArray(pack) {
    const obj = new this(new Circle(pack[PACK.x], pack[PACK.y], pack[PACK.r]));
    const subpack = pack.slice(4);
    [
      obj.team,
      obj.hasBall,
      obj.pickUp,
      obj.throwing,
      obj.wearingMask,
    ] = decodeNumArray(subpack, 5);
    return obj;
  }
}

class MedicBody extends CivilianBody {
  constructor(circle, v) {
    super(circle, v);
    this.type = Body.TYPES.MEDIC;
    this.curingPlayer = false;
  }
  /**
   * attach coronavirus to player
   * @param {BoardBody} ball
   */
  _pickupCorona(ball) {
    // to be implemented
  }

  /**
   * throws coronavirus at target position coord
   * @param {Vec2} targetPosition
   */
  _throwCorona(targetPosition) {
    // to be implemented
  }

  /**
   *
   * @param {BoardBody} player
   * @returns {BoardBody} player with wearingMask set to true
   */
  _curingPlayer(player) {
    // to be implemented
    // player.wearingMask = true;
    // return player;
  }
  toArray() {
    const array = new Float32Array(this.arraySize);
    array.fill(0);
    const fillin = [this.circle.x, this.circle.y, this.circle.r, this.type];
    array.set(fillin);
    const encoded = encodeBoolArray([
      this.team,
      this.hasBall,
      this.pickUp,
      this.throwing,
      this.wearingMask,
      this.curingPlayer,
    ]);
    array.set(encoded, fillin.length);
    return array;
  }
  static fromArray(pack) {
    const obj = new this(new Circle(pack[PACK.x], pack[PACK.y], pack[PACK.r]));
    const subpack = pack.slice(4);
    [
      obj.team,
      obj.hasBall,
      obj.pickUp,
      obj.throwing,
      obj.wearingMask,
      obj.curingPlayer,
    ] = decodeNumArray(subpack, 6);
    return obj;
  }
}

class JacindaBody extends CivilianBody {
  constructor(circle, v) {
    super(circle, v);
    this.type = Body.TYPES.JACINDA;
    this.speed = 1.5;
    this.inParliament = false;
  }
}

function entityFromArray(array) {
  const type = array[PACK.type];
  if (type == Body.TYPES.PLAYER) {
    return PlayerBody.fromArray(array);
  }
  if (type == Body.TYPES.BALL) {
    return BallBody.fromArray(array);
  }
  if (type == Body.TYPES.MEDIC) {
    return MedicBody.fromArray(array);
  }
  if (type == Body.TYPES.CIVILIAN) {
    return CivilianBody.fromArray(array);
  }
  if (type == Body.TYPES.JACINDA) {
    return JacindaBody.fromArray(array);
  }
  throw "Type not found";
}

function entitiesFromArray(array) {
  const entityArrays = _.chunk(array, SIZE);
  return entityArrays.map(entityFromArray);
}

function entitiesToArray(bodies) {
  const array32 = new Float32Array(bodies.length * SIZE);
  bodies.forEach((body, i) => {
    array32.set(body.toArray(), i * SIZE);
  });
  return array32;
}

function encodeBoolArray(bools, elemsize = 8, maxlen = Infinity) {
  const encodedLength = Math.ceil(bools.length / elemsize);
  if (encodedLength > maxlen)
    throw "Encoded boolean array exceeds the maximum length";
  const encoded = new Array(encodedLength).fill(0);
  bools.forEach((x, i) => {
    var offset = i % elemsize;
    var idx = Math.floor(i / elemsize);
    encoded[idx] = encoded[idx] | ((x != 0) << offset);
  });
  return encoded;
}

function decodeNumArray(nums, length, elemsize = 8) {
  if (nums.length * elemsize < length)
    throw "Expected number of booleans is larger than the decoded numbers array";
  const bools = [];
  for (var i = 0; i < length; i++) {
    var idx = Math.floor(i / elemsize);
    var offset = i % elemsize;
    var bool = (nums[idx] & (1 << offset)) != 0;
    bools.push(bool);
  }
  return bools;
}

module.exports = {
  Body: Body,
  BallBody: BallBody,
  PlayerBody: PlayerBody,
  CivilianBody: CivilianBody,
  MedicBody: MedicBody,
  JacindaBody: JacindaBody,
  entitiesFromArray: entitiesFromArray,
  entitiesToArray: entitiesToArray,
  entityFromArray: entityFromArray,
};
// Example of encoding and reading players
// const player = new PlayerBody(new Circle(0, 0, 12));
// const medic = new MedicBody(new Circle(0, 0, 12));
// const jacinda = new JacindaBody(new Circle(0, 0, 12));
// const ball = new BallBody(new Circle(1, 1, 10));
// const pack = entitiesToArray([player, ball, medic, jacinda]);
// console.log(pack);
// const entities = entitiesFromArray(pack);
// console.log(entities);
