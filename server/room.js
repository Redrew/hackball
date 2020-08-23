"use strict";
const md5 = require("blueimp-md5"),
  _ = require("lodash");

const { Vec2, Circle, Rect } = require("../shared/math"),
  config = require("../shared/config"),
  io = require("../index"),
  ge = require("../shared/gameBody");
console.log(config);

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

  omitUninitialized(entities) {
    return _.filter(entities, (entity) => entity.body != null);
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

    // collision between every player with every other entity (ball and player)
    for (let i = 0; i < players.length; i++) {
      if (i === index) continue;

      // Get center of circle of second entity
      let p2 = players[i].body,
        c2 = p2.circle.center;

      // If the circles are colliding
      if (p1.circle.intersect(p2.circle)) {
        // if both players
        if (!p2.type === ge.Body.TYPES.BALL) {
          if (p1.isMedic && p2.caughtCorona) {
            // if one has corona and the other is medic, medic saves patient
          }
        } else {
          // if player and corona
          let dist = p2.circle.distance(p1.circle),
            vx = (c2.x - c1.x) / dist,
            vy = (c2.y - c1.y) / dist;

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

  // _checkBallCollisions(entities, index) {
  //   // index is always an MOVING ball
  //   let ball = entities[index].body,
  //     ballCircle = ball.circle,
  //     ballV = ball.v,
  //     hasCollision = false;

  //   // collision between ball with every other entity
  //   for (let i = 0; i < entities.length; ++i) {
  //     let entity = entities[i].body,
  //       entityCircle = entity.circle,
  //       entityV = entity.v,
  //       isBall = entity.type === ge.Body.TYPES.BALL,
  //       isMoving = isBall && entity.moving;

  //     // skip itself
  //     if (i === index) continue;

  //     // if there is a collision
  //     if (ballCircle.intersect(entityCircle)) {
  //       // collion between ball and player
  //       if (!isBall) {
  //         // no matter who you are or what team you are on,
  //         // if you are healthy and hit with a ball, you are frozen
  //         if (!entity.caughtCorona) {
  //           console.log("im here");
  //           console.log(ball.moving);
  //           entity._frozen();
  //         }
  //       }
  //       // collision between ball and ball
  //       else {
  //         // to be implemented: both balls either cancel out or roll away?
  //       }
  //     }
  //   }
  // }

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
          _.indexOf(this.players, player)
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
   * @param body    a class from gameBody.js
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
    const players = this.omitUninitialized(
      this.omitTeam(Room.Teams.SPECTATORS)
    );
    const entities = _.concat(players, this.balls);

    _.each(entities, (entity, index) => {
      let circle = entity.body.circle,
        v = entity.body.v,
        isBall = entity.body.type === ge.Body.TYPES.BALL,
        isMoving = isBall && entity.body.moving,
        isCivilian = entity.body.type === ge.Body.TYPES.CIVILIAN,
        isMedic = entity.body.type === ge.Body.TYPES.MEDIC,
        isJacinda = entity.body.type === ge.Body.TYPES.JACINDA;

      for (let i = 0; i < entities.length; i++) {
        // skip itself
        if (i === index) continue;

        // if collision, call the body's collide function
        // collide functions return the team that gets 1 point
        let circle2 = entities[i].body.circle;
        if (circle.intersect(circle2)) {
          entity.body.collide(entities[i]);
          // if (entity.body.collide(entities[i])) {
          //   this._addGoal(entity.body.collide(entities[i]));
          // }
        }
      }

      // if entity is a MOVING ball and its velociy is small, mark it not moving [Moved to BallBody.update(game)]

      // // Check collisions between MOVING balls and players/balls (hit by)
      // if (isMoving) this._checkBallCollisions(entities, index);

      // // Check collisions between players and players/balls (pickup/throw)
      // if (!isBall) this._checkPlayerCollisions(entities, index);

      // Check collisions with borders
      this._calcBordersCollisions(entity.body, !isBall && 64);

      // Update
      entity.body.update(this);

      let mouse_pos_x = entity.mouse_position_x || 0.0;
      let mouse_pos_y = entity.mouse_position_y || 0.0;
    });

    const bodiesToRender = [];
    entities.forEach((entity) => {
      var body = entity.body;
      if (body.type === ge.Body.TYPES.BALL && body.pickedUp) return;
      bodiesToRender.push(body);
    });
    const socketData = ge.entitiesToArray(bodiesToRender);

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
        body: new ge.BallBody(circle, i, new Vec2(0, 0)),
      });
    }
  }

  /**
   * Start/stop room loop
   */
  start() {
    console.log("Game start");
    // Creating new player bodies and adding to players list
    for (let i = 0; i < this.players.length; i++) {
      var player = this.players[i];
      player.body = new ge.PlayerBody(new Circle(60, 60, 13), new Vec2(0, 0));
      player.body.team = player.team;
    }
    this.players.forEach((player) => this._alignOnBoard(player));

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
    this._broadcastSettings();
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
    // assign the player to team and room
    _.assign(player, {
      team: Room.Teams.SPECTATORS,
      room: this,
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
