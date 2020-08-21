"use strict";
const md5 = require("blueimp-md5"),
  _ = require("lodash");

const { Vec2, Circle, Rect } = require("../shared/math"),
  config = require("../shared/config"),
  io = require("../app"),
  ge = require("../shared/gameBody");
console.log(config);
/**
 * Body showed on board
 * @class
 */
class BoardBody {
  constructor(room, circle, v, type = BoardBody.TYPES.PLAYER) {
    this.circle = circle;
    this.v = v || new Vec2();
    this.room = room;
    this.type = type;
  }
}

BoardBody.TYPES = {
  PLAYER: 0,
  BALL: 1,
};

/**
 * Room class
 * @class
 */
class Room {
  constructor(name, admin, maxPlayers, password, hidden) {
    this.name = name;
    this.maxPlayers = maxPlayers || 2;
    this.password = md5(password);

    // Balls config
    this.numBalls = config.numBalls;
    this.ballR = config.ballR;

    // todo: Vertical gates
    this.board = new Rect(0, 0, 600, 300);
    this.goals = {
      0: { size: 30, sign: -1, p1: [0, 70], p2: [0, 230], score: 0 },
      2: { size: 30, sign: 1, p1: [600, 70], p2: [600, 230], score: 0 },
    };

    // Players
    this.players = [];
    this.admin = admin;
    this.join(admin);

    // hide room in rooms list
    if (hidden !== true) (Room.list = Room.list || []).push(this);
  }

  /**
   * Get teams with players nicks
   */
  get teamsHeaders() {
    return _.chain(this.players)
      .groupBy("team")
      .mapValues(_.partial(_.map, _, "nick"))
      .value();
  }

  /**
   * Returns true if passwords matches
   * @param password  Password in plain text
   * @returns {boolean}
   */
  checkPassword(password) {
    return md5(password) === this.password;
  }

  /**
   * Returns true if server is full
   * @returns {boolean}
   */
  isFull() {
    return this.maxPlayers <= this.players.length;
  }

  /**
   * Returns true is room is locked
   * @returns {boolean}
   */
  isLocked() {
    return this.password !== "d41d8cd98f00b204e9800998ecf8427e";
  }

  /**
   * Kick player from room
   * @param player  Player
   * @returns {Room}
   */
  kick(player) {
    if (!player) return;

    player.socket.emit("roomKick", "You are kicked!");
    this.leave(player);
    return this;
  }

  /**
   * Get list of all players from all teams without omit
   * @param omit  Omit team name
   * @returns Players
   */
  omitTeam(omit) {
    return _.filter(this.players, (player) => player.team !== omit);
  }

  /**
   * Destroy room
   */
  destroy() {
    // Stop interval
    this.stop();

    // Kick all players ;)
    _.each(this.players, this.kick.bind(this));
    _.remove(Room.list, this);
    return this;
  }

  /**
   * Check room collisions
   * @param players Players array
   * @param index   Player index
   * @private
   */
  _checkPlayerCollisions(players, index) {
    let p1 = players[index].body,
      c1 = p1.circle.center,
      hasCollision = false;
    const test = false;

    // collision between every player with every other entity (ball and player)
    for (let i = 0; i < players.length; ++i) {
      if (i === index) continue;

      // Get center of circle of second entity
      let p2 = players[i].body,
        c2 = p2.circle.center;

      // If the circles are colliding
      if (p1.circle.intersect(p2.circle)) {
        // if both players
        if (!p1.isBall && !p2.isBall) {
          // if one has corona and the other is medic, medic saves patient
          if (p1.isMedic && p2.caughtCorona) {
          }
        }
        // if player and corona
        else {
        }

        if (!test) {
          let dist = p2.circle.distance(p1.circle),
            vx = (c2.x - c1.x) / dist,
            vy = (c2.y - c1.y) / dist;

          if (
            // throw when space bar is pressed and there is a ball already picked up
            players[i].body.type === BoardBody.TYPES.BALL &&
            players[index].flags & 2 &&
            players[index].body.hasBall === players[i]
          ) {
            // console.log("sdfadsfdhjsefbheabfjkfssa");
            players[index].body.hasBall = null;
            players[i].body.pickedUp = false;
            vx *= 8;
            vy *= 8;
          } else if (
            players[i].body.type === BoardBody.TYPES.BALL &&
            (players[index].body.hasBall === players[i] ||
              !players[index].body.hasBall)
          ) {
            // pick up ball

            // console.log("lol");
            players[index].body.hasBall === players[i];
            players[index].body.hasBall = players[i];
            players[i].body.pickedUp = true;
            players[i].body.circle.x = players[index].body.circle.x;
            players[i].body.circle.y = players[index].body.circle.y;
            players[i].body.v.x = players[index].body.v.x;
            players[i].body.v.y = players[index].body.v.y;
            continue;
            // vx *= 8;
            //vy *= 8;
          }

          // "weight"
          p1.v.mul(0.9);

          // Make ball owner
          // if (!p1.owner || p1.owner === -1) p1.owner = i;

          // Add to velocity vector
          if (
            index !== players.length - 1 ||
            p1.owner !== i ||
            (Math.sign(p2.v.y) > 0 &&
              p1.circle.y + p1.circle.r * 2 + 5 >=
                this.board.y + this.board.h) ||
            (Math.sign(p2.v.y) < 0 && p1.circle.y - 5 <= this.board.y) ||
            (Math.sign(p2.v.x) > 0 &&
              p1.circle.x + p1.circle.r * 2 + 5 >=
                this.board.x + this.board.w) ||
            (Math.sign(p2.v.x) < 1 && p1.circle.x - 5 <= this.board.x)
          ) {
            p2.v.x += vx * p1.v.length;
            p2.v.y += vy * p1.v.length;
            p2.circle.add(p2.v);
          }
        }

        // Mark flag
        hasCollision = true;
      }
    }
    if (!hasCollision) players[players.length - 1].owner = -1;
    return hasCollision;
  }

  _checkBallCollisions(entities, index) {
    if (entities[index].body.pickedUp) {
      return;
    }
    let ball1 = entities[index].body,
      ballCircle1 = ball1.circle.center,
      hasCollision = false;

    // collision between ball with every other entity
    for (let i = 0; i < entities.length; ++i) {
      // skip itself
      if (i === index) continue;
      // collision between ball and player
      else if (entities[i].body.type === BoardBody.TYPES.PLAYER) {
        let player = entities[i].body,
          playerCircle = player.circle.center;
      }
      // collision between ball and ball
      else if (entities[i].body.type === BoardBody.TYPES.BALL) {
        let ball2 = entities[i].body,
          ballCircle2 = ball2.circle.center;
      }
    }
  }

  /**
   * Set player position on board
   * @param player  Player
   * @returns {Room}
   */
  _alignOnBoard(player) {
    if (player.team !== Room.Teams.SPECTATORS) {
      let goal = this.goals[player.team];
      player.body.circle.xy = [
        (goal.p1[0] + goal.p2[0]) / 2 - player.body.circle.r,
        (goal.p1[1] + goal.p2[1]) / 2 - player.body.circle.r,
      ];

      // Move to center if has collision
      while (
        this._checkPlayerCollisions(
          this.players,
          _.indexOf(this.players, player),
          true
        )
      ) {
        let direction = this.board.center.sub(player.body.circle).normalize();
        player.body.circle.add(direction.mul(player.body.circle.r * 2 + 2));
      }
    }
    return this;
  }

  /**
   * Broadcast goal and add score to team
   * @param team  Team index
   * @returns {Room}
   * @private
   */
  _addGoal(team) {
    this.goals[team].score++;
    this.broadcast("roomScore", _.mapValues(this.goals, "score")).start();
    return this;
  }

  /**
   * Check collisions with board border
   * @param body    BoardBody
   * @param margin  Margin
   * @returns {Room}
   * @private
   */
  _calcBordersCollisions(body, margin) {
    margin = margin || 0;

    if (
      (body.circle.y < -margin && body.v.y < 0) ||
      (body.circle.y + body.circle.r * 2 > this.board.h + margin &&
        body.v.y > 0)
    )
      body.v.y *= -1;
    if (
      (body.circle.x < -margin && body.v.x < 0) ||
      (body.circle.x + body.circle.r * 2 > this.board.w + margin &&
        body.v.x > 0)
    )
      body.v.x *= -1;

    return this;
  }

  /**
   * Update physics in loop
   * @private
   */
  _updatePhysics() {
    const players = this.omitTeam(Room.Teams.SPECTATORS);
    const entities = _.concat(players, this.balls);

    // Socket data [x, y, r, flag, mouse_position_x, mouse_position_y]
    let packSize = 6,
      socketData = new Float32Array(entities.length * packSize);

    _.each(entities, (entity, index) => {
      let circle = entity.body.circle,
        v = entity.body.v,
        isBall = entity.body.type === BoardBody.TYPES.BALL;
      // isMedic = entity.body.type === Medic;
      // isJacinda = entity.body.type === Jacinda;
      // Hack change, change back when class types are defined
      var isMedic = false;
      var isJacinda = false;

      // Check collisions between players
      if (!isBall) this._checkPlayerCollisions(entities, index);

      // Check collisions between balls and players/balls
      if (isBall) this._checkBallCollisions(entities, index);

      // Check collisions with goals

      //   // If its colliding with goal
      //   if(collidingGoal) {
      //     this._addGoal(collidingGoal);
      //     return false;
      //   }
      // }

      // Check collisions with borders
      this._calcBordersCollisions(entity.body, !isBall && 64);

      // Update physics
      circle.add(v);
      v.mul(0.95);

      // Data structure: 0FFFFBRR
      let flags = entity.team | (isBall && 1 << 2) | (entity.flags << 3);

      let mouse_pos_x = entity.mouse_position_x || 0.0;
      let mouse_pos_y = entity.mouse_position_y || 0.0;
      socketData.set(
        [
          /** position */
          circle.x,
          circle.y,
          circle.r,
          flags,
          mouse_pos_x,
          mouse_pos_y /** todo: More flags */,
        ],
        index * packSize
      );
      //
      ///**
      // * Data in buffer is compressed, player must
      // * know which from the list is player
      // * todo: Fix it, merge with roomSettings
      // */
      //player.socket("roomPlayerIndex", index);
    });

    // Broadcast
    this.broadcast("roomUpdate", socketData.buffer);
  }

  _createBalls() {
    this.balls = [];
    // const yInterval = this.board.h / (this.numBalls + 1);
    for (var i = 0; i < this.numBalls; i++) {
      var x = Math.random() * this.board.w;
      var y = Math.random() * this.board.h;
      // var x = this.board.w / 2 - this.ballR;
      // var y = (i + 1) * yInterval - this.ballR;
      var circle = new Circle(x, y, this.ballR);
      this.balls.push({
        body: new BoardBody(this, circle, null, BoardBody.TYPES.BALL),
      });
    }
  }
  /**
   * Start/stop room loop
   */
  start() {
    // assign roles

    // Set balls
    this._createBalls();

    // Start interval
    this.physicsInterval && this.stop();
    this.physicsInterval = setInterval(
      this._updatePhysics.bind(this),
      1000 / 60
    );
  }
  stop() {
    clearInterval(this.physicsInterval);
  }

  /**
   * Set player team
   * @param player    Player
   * @param newTeam   New team
   * @returns {Room}
   */
  setTeam(player, newTeam) {
    // Create new body
    player.team = newTeam;
    this._alignOnBoard(player)._broadcastSettings();
    return this;
  }

  /**
   * Broadcast to all sockets connected to room
   * @param arguments Broadcast arguments
   * @returns {Room}
   */
  broadcast() {
    let obj = io.sockets.in(this.name);
    obj && obj.emit.apply(obj, arguments);
    return this;
  }

  /**
   * Send room settings to all player socket
   * @param socket  Socket
   * @returns {Room}
   * @private
   */
  _broadcastSettings(socket) {
    let data = {
      teams: this.teamsHeaders,
      board: this.board.xywh,
      goals: this.goals,
      admin: this.admin.nick,
    };
    (socket ? socket.emit.bind(socket) : this.broadcast.bind(this))(
      "roomSettings",
      data
    );
    return this;
  }

  /**
   * Join to room
   * @param player  Player
   * @returns {Room}
   */
  join(player) {
    // Adding to list
    _.assign(player, {
      team: Room.Teams.SPECTATORS,
      room: this,
      body: new BoardBody(this, new Circle(60, 60, 13)),
    });

    // Join socket
    player.socket.join(this.name);
    this.players.push(player);

    // Broadcast to except player
    player.socket.broadcast
      .to(this.name)
      .emit("roomPlayerJoin", _.pick(player, "nick", "team"));

    // Send list of players to player
    this._broadcastSettings(player.socket);
    return player;
  }

  /**
   * Leave player from room
   * @param player  Player
   * @returns {Room}
   */
  leave(player) {
    if (!player) return;

    // Leave
    player.socket.leave(this.name);
    this.broadcast("roomPlayerLeave", _.pick(player, "team", "nick"));

    // Reset variables for future room
    player.room = player.team = null;

    _.remove(this.players, player);
    this.admin === player && this.destroy();
    return this;
  }

  /**
   * Return list of rooms
   * @returns {Array}
   */
  static headers() {
    return _.map(Room.list, (room) => {
      return {
        country: room.admin.country,
        name: room.name,
        password: room.isLocked() ? "yes" : "no",
        players: room.players.length + "/" + room.maxPlayers,
      };
    });
  }
}

/** Team codes */
Room.Teams = {
  LEFT: 0,
  SPECTATORS: 1,
  RIGHT: 2,
};

/** Export modules */
module.exports = {
  Room: Room,
};
