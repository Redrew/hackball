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
    this.arraySize = SIZE;
  }
  init() {}
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
    this.type = Body.TYPES.PLAYER;
    this.speed = 1;
    this.aimDirection = 0; // in radians
    this.ballId = null;
    this.moving = false;

    // Sent to client
    this.hasBall = false;
    this.pickUp = false;
    this.throw = false;
  }

  toArray() {
    const array = new Float32Array(this.arraySize);
    array.fill(0);
    const fillin = [this.circle.x, this.circle.y, this.circle.r, this.type];
    array.set(fillin);
    const encoded = encodeBoolArray([this.hasBall, this.pickUp, this.throw]);
    array.set(encoded, fillin.length);
    return array;
  }
  static fromArray(pack) {
    const obj = new this(new Circle(pack[PACK.x], pack[PACK.y], pack[PACK.r]));
    const subpack = pack.slice(4);
    [this.hasBall, this.pickUp, this.throw] = decodeNumArray(subpack, 3);
    return obj;
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
    [this.team, this.moving] = decodeNumArray(subpack, 2);
    return obj;
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
      this.hasBall,
      this.pickUp,
      this.throw,
      this.wearingMask,
    ]);
    array.set(encoded, fillin.length);
    return array;
  }
  static fromArray(pack) {
    const obj = new this(new Circle(pack[PACK.x], pack[PACK.y], pack[PACK.r]));
    const subpack = pack.slice(4);
    [this.hasBall, this.pickUp, this.throw, this.wearingMask] = decodeNumArray(
      subpack,
      4
    );
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
      this.hasBall,
      this.pickUp,
      this.throw,
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
      this.hasBall,
      this.pickUp,
      this.throw,
      this.wearingMask,
      this.curingPlayer,
    ] = decodeNumArray(subpack, 5);
    return obj;
  }
}

class JacindaBody extends CivilianBody {
  constructor(circle, v) {
    super(circle, v);
    this.type = Body.TYPES.JACINDA;
    this.curingPlayer = false;
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
    encoded[idx] = encoded[idx] | (x << offset);
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

// Example of encoding and reading players
// const player = new PlayerBody(new Circle(0, 0, 12));
// const medic = new MedicBody(new Circle(0, 0, 12));
// const jacinda = new JacindaBody(new Circle(0, 0, 12));
// const ball = new BallBody(new Circle(1, 1, 10));
// const pack = entitiesToArray([player, ball, medic, jacinda]);
// console.log(pack);
// const entities = entitiesFromArray(pack);
// console.log(entities);
