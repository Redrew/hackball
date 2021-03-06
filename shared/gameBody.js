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
    this.extraBoolAttrs = null;
    this.extraNumAttrs = null;
  }
  init() {}
  update(game) {
    //Updates previous velocity
    this.prevVel = this.v;
    // Update physics
    this.circle.add(this.v);
    this.v.mul(0.95);
  }
  collide(obj) {}

  //Bounces off entity
  bounce(entity) {
    // Check if one of the entities is a pickedUp ball
    if (this.pickedUp || entity.pickedUp) {
      return;
    }
    let circle = entity.body.circle,
      entVel = entity.body.prevVel,
      //dist = entity.body.circle.distance(this.circle),
      xDist = this.circle.x - circle.x,
      yDist = this.circle.y - circle.y,
      vDif = this.v.clone().sub(entVel),
      massRatio = entity.body.circle.r ** 2 / this.circle.r ** 2,
      dist = (xDist ** 2 + yDist ** 2) ** 0.5,
      intersectionRatio = Math.max(
        (entity.body.circle.r + this.circle.r - dist) / this.circle.r,
        0
      );

    //Ball bounces off code
    const impulseDir = new Vec2(xDist, yDist).normalize();
    if (vDif.dotP(impulseDir) < 0) {
      const impulse = impulseDir
        .clone()
        .mulScal(entVel.add(this.v, -1.0).dotP(impulseDir) * massRatio);
      this.v.add(impulse, 1.0);
      //Loss of vel in collision
      this.v.mulScal(0.7);
    }
    // Add velocity for being inside another entity
    // this.v.add(impulseDir.mul(intersectionRatio * 0.01));
    // Clip the maximum speed
    this.v = this.v.mul(
      Math.min(this.v.length, 48 / this.circle.r) / this.v.length
    );

    //This clears some space between the collision
    // this.circle.add(this.v);
  }

  toArray() {
    const array = new Float32Array(this.arraySize);
    array.fill(0);
    const fillin = [this.circle.x, this.circle.y, this.circle.r, this.type];
    if (this.extraNumAttrs != null) {
      this.extraNumAttrs.forEach((nAttr) => fillin.push(this[nAttr]));
    }
    array.set(fillin);
    if (this.extraBoolAttrs != null) {
      const attrValues = this.extraBoolAttrs.map((a) => this[a]);
      const encoded = encodeBoolArray(attrValues);
      array.set(encoded, fillin.length);
    }
    return array;
  }
  static fromArray(pack) {
    const obj = new this(new Circle(pack[PACK.x], pack[PACK.y], pack[PACK.r]));
    let subpack = pack.slice(PACK.type + 1);
    if (obj.extraNumAttrs != null) {
      obj.extraNumAttrs.forEach((nAttr, i) => (obj[nAttr] = subpack[i]));
      subpack = subpack.slice(obj.extraNumAttrs.length);
    }
    if (obj.extraBoolAttrs != null) {
      decodeNumArray(subpack, obj.extraBoolAttrs.length).forEach(
        (v, i) => (obj[obj.extraBoolAttrs[i]] = v)
      );
    }
    return obj;
  }
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
    this.mousePosition = new Vec2(0, 0); // in radians
    this.ball = null;
    this.throwSpeed = 8;

    // Sent to client
    this.team = 0;
    this.wearingMask = false;
    this.caughtCorona = false;
    this.hasBall = false;
    this.pickUp = false;
    this.throwing = false;

    this.extraBoolAttrs = ["hasBall", "pickUp", "throwing", "caughtCorona"];
    this.extraNumAttrs = ["team"];
  }

  update(game) {
    if (this.caughtCorona) this.v.xy = [0, 0];
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
    const throwDirection = this.mousePosition
      .clone()
      .sub(this.circle.center)
      .sub([ballr, ballr])
      .normalize();
    const spawnDistance = r + ballr + 1;
    var spawnLocation = this.circle.center.add(throwDirection, spawnDistance);
    spawnLocation.r = this.ball.circle.r;
    this.ball.circle.xy = spawnLocation.xy;
    this.ball.v = throwDirection.clone().mul(this.throwSpeed);
    this.ball.team = this.team;
    this.ball.pickedUp = false;
    this.ball = null;
    this.hasBall = false;
  }

  collide(entity) {
    let circle = entity.body.circle,
      v = entity.body.v,
      dist = entity.body.circle.distance(this.circle),
      isBall = entity.body.type === Body.TYPES.BALL,
      isMoving = isBall && entity.body.moving,
      isCivilian = entity.body.type === Body.TYPES.CIVILIAN,
      isMedic = entity.body.type === Body.TYPES.MEDIC,
      isJacinda = entity.body.type === Body.TYPES.JACINDA;

    // collision between player and ball on floor
    
    if (!this.hasBall && isBall && !isMoving) {
      // pick up corona
      this.ball = entity.body;
      this.hasBall = true;
      entity.body.pickedUp = true;
      entity.body.team = this.team;
      circle.x = this.circle.x;
      circle.y = this.circle.y;
      v.x = this.v.x;
      v.y = this.v.y;
    } else {
      // collision between player and moving ball FROM DIFFERENT TEAM
      if (isBall && isMoving && entity.body.team != this.team) {
        // if player is healthy and does not have ball, they catch corona
        // otherwise, nothing happens
        this.caughtCorona = true;
        entity.body.moving = false;
        entity.body.team = null;
      }

      // collision between player and players
      if (!isBall) {
        // if healthy player runs into sick player, they become sick
        if (
          !this.caughtCorona &&
          this.type != Body.TYPES.MEDIC &&
          entity.body.caughtCorona
        ) {
          this.caughtCorona = true;
        }
      }

      // EVERYTHING BOUNCE OFF EACH OTHER !!!!
      this.bounce(entity);
    }
    return null;
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

    this.extraBoolAttrs = ["moving"];
    this.extraNumAttrs = ["team"];
  }

  update(game) {
    super.update(game);
    if (this.moving && this.v.length < 0.1) {
      this.moving = false;
      this.team = null;
    }
    if (this.team != null && this.v.length > 0.1) {
      this.moving = true;
    }
  }

  collide(entity) {
    let circle = entity.body.circle,
      entVel = entity.body.prevVel,
      dist = entity.body.circle.distance(this.circle),
      xDist = this.circle.x - circle.x,
      yDist = this.circle.y - circle.y,
      isBall = entity.body.type === Body.TYPES.BALL,
      isMoving = isBall && entity.body.moving,
      isCivilian = entity.body.type === Body.TYPES.CIVILIAN,
      isMedic = entity.body.type === Body.TYPES.MEDIC,
      isJacinda = entity.body.type === Body.TYPES.JACINDA;

    // collision
    this.bounce(entity);
    if (isBall) {
    // balls roll away, both balls becomes non-moving and ready for pickup

    // Turned off, can be changed
    this.moving = false;
    this.pickedUp = false;
    this.team = null;
    entity.body.moving = false;
    entity.body.pickedUp = false;
    entity.team = null;
    }
  }
}

class CivilianBody extends PlayerBody {
  constructor(circle, v) {
    super(circle, v);
    this.type = Body.TYPES.CIVILIAN;

    // Sent to client
    this.wearingMask = false;

    this.extraBoolAttrs.push("wearingMask");
  }
}

class MedicBody extends CivilianBody {
  constructor(circle, v) {
    super(circle, v);
    this.type = Body.TYPES.MEDIC;

    // Sent to client
    this.curingPlayer = false;
    this.maxTime = 300;
    this.cureTimer = this.maxTime;
    this.savePlayer;
    this.speed = 0.8;

    this.extraBoolAttrs.push("curingPlayer");
  }
  update(game) {
    super.update(game);
  }

  collide(entity) {
    super.collide(entity);

    //Cure people logic
    if (entity instanceof PlayerBody && entity.caughtCorona) {
      if (this.savePlayer === entity) {
        this.cureTimer -= 1;

        //save player when timer is up
        if (this.cureTimer <= 0) {
          this.savePlayer.caughtCorona = false;
        }
      }
      //Start saving player
      else {
        this.savePlayer = entity;
        this.cureTimer = this.maxTime;
      }
    }
    //not saving anyone
    else {
      this.savePlayer = null;
    }
  }
}

class JacindaBody extends CivilianBody {
  constructor(circle, v) {
    super(circle, v);
    this.type = Body.TYPES.JACINDA;

    // Sent to client
    this.speed = 1.5;
    this.inParliament = false;

    this.extraNumAttrs.push("speed");
    this.extraBoolAttrs.push("inParliament");
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
// player.team = 1;
// const medic = new MedicBody(new Circle(0, 0, 12));
// const jacinda = new JacindaBody(new Circle(0, 0, 12));
// const ball = new BallBody(new Circle(1, 1, 10));
// const pack = entitiesToArray([player]);
// console.log(pack);
// const entities = entitiesFromArray(pack);
// console.log(entities);
