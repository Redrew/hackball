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
    this.roles = {
      0: { MEDIC: [] },
      2: { MEDIC: [] },
    };

    // Players
    this.players = [];
    this.admin = admin;
    this.join(admin);

    // Count for players in each team
    this.leftPlayers = [];
    this.rightPlayers = [];

    // Count for players in each team
    this.leftPlayers = [];
    this.rightPlayers = [];

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
   * Set player position on board
   * @param player  Player
   * @returns {Room}
   */
  _alignOnBoard(player, index) {
    // list of all entities in the game
    const entities = this.omitUninitialized(
      this.omitTeam(_.concat(this.players, this.balls), Room.Teams.SPECTATORS)
    );

    if (player.team !== Room.Teams.SPECTATORS) {
      let goal = this.goals[player.team];
      player.body.circle.xy = [
        (goal.p1[0] + goal.p2[0]) / 2 - player.body.circle.r,
        (goal.p1[1] + goal.p2[1]) / 2 - player.body.circle.r,
      ];

      // Move to center if has collision
      for (let i = 0; i < entities.length; i++) {
        var otherBody = entities[i].body;
        if (player.body == otherBody) continue;
        // var c = 0;
        while (player.body.circle.intersect(otherBody.circle)) {
          console.log("aligning", player.body.circle.xy);
          let direction = this.board.center.sub(player.body.circle).normalize();
          player.body.circle.add(direction.mul(player.body.circle.r * 2 + 2));
        }
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
   * 
   * @param {*} body 
   * @param {*} margin 
   */
  _checkParliamentCollisions(circle, team) {
    let leftParliament = new Rect(10, 10, 60, 25);
    let rightParliament = new Rect(this.board.w - 70, this.board.h-35, 60, 25);
    if (team === Room.Teams.LEFT) {
      return circle.intersect(rightParliament)
    }
    else if (team === Room.Teams.RIGHT) {
      return circle.intersect(leftParliament);
    }
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

  _calcCoronavirusTotal(team) {
    let total = 0;
    const players = this.omitUninitialized(
      this.omitTeam(this.players, Room.Teams.SPECTATORS)
    );
    for (let i = 0; i < this.players.length; i++) {
      if (players[i].team !== null && players[i].team === team && players[i].body.caughtCorona) {
        total += 1;
      }
    }
    return total;
  }

  /**
   * Update physics in loop
   * @private
   */
  _updatePhysics() {
    const players = this.omitUninitialized(
      this.omitTeam(Room.Teams.SPECTATORS)
    );
    const allEntities = _.concat(players, this.balls);
    const entities = allEntities.filter(
      (entity) => entity.body.pickedUp != true
    );

    // update scoreboard
    let leftFallen = this._calcCoronavirusTotal(Room.Teams.LEFT),
    rightFallen = this._calcCoronavirusTotal(Room.Teams.RIGHT),
    leftTotal = this.leftPlayers.length,
    rightTotal = this.rightPlayers.length;

    if (leftFallen > 0 && leftFallen === leftTotal) {
      this._addGoal(Room.Teams.RIGHT);

    } else if (rightFallen > 0 && rightFallen === rightTotal) {
      this._addGoal(Room.Teams.LEFT);
    }

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
        let circle2 = entities[i].body.circle;
        if (circle.intersect(circle2)) {
          entity.body.collide(entities[i]);
        }
      }

      // Check collisions with borders
      this._calcBordersCollisions(entity.body, 0);

      // Check collisions with opponent's parliament 
      if (isJacinda && checkParliamentCollisions(circle, entity.team)) {
        // automatic point
        this._addGoal(entity.team);
      }
      
    });


    _.each(entities, (entity) => {
      entity.body.update(this);
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

  _resetScoreboard() {
    this.goals = {
      0: { size: 30, sign: -1, p1: [0, 70], p2: [0, 230], score: 0 },
      2: { size: 30, sign: 1, p1: [600, 70], p2: [600, 230], score: 0 },
    };
    console.log("IM CALLED");
  }

  

  /**
   * Start/stop room loop
   */
  start() {
    console.log("Game start");
    const players = this.omitTeam(this.players, Room.Teams.SPECTATORS);
    // Creating new player bodies and adding to players list
    for (let i = 0; i < players.length; i++) {
      var player = players[i];
      // console.log(
      //   this.roles[player.team].MEDIC,
      //   player in this.roles[player.team].MEDIC
      // );
      if (this.roles[player.team].MEDIC.includes(player)) {
        player.body = new ge.MedicBody(new Circle(60, 60, 13), new Vec2(0, 0));
      } else {
        player.body = new ge.PlayerBody(new Circle(60, 60, 13), new Vec2(0, 0));
      }
      player.body.team = player.team;
    }
    players.forEach((player) => this._alignOnBoard(player));

    // Assign roles

    // Set balls
    this._createBalls();

    // Start interval
    this.physicsInterval && this.stop();
    this.physicsInterval = setInterval(
      this._updatePhysics.bind(this),
      500 / 60
    );

    // Reset scoreboard
    // this._resetScoreboard();

  }

  stop() {
    clearInterval(this.physicsInterval);
  }

  setRole(player, role) {
    console.log(role);
    this.roles[player.team][role] = [player];
    console.log(this.roles);
  }

  removeFromRoles(player) {
    _.keys(this.roles, (team) => {
      _.keys(this.roles[team], (role) => {
        _.remove(this.roles[team][role], player);
      });
    });
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

    // Remove team based trackers on player
    _.remove(this.leftPlayers, player);
    _.remove(this.rightPlayers, player);
    this.removeFromRoles(player);

    if (newTeam === Room.Teams.LEFT) {
      this.leftPlayers.push(player);
    } else if (newTeam === Room.Teams.RIGHT) {
      this.rightPlayers.push(player);
    }
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

    // Remove from roles dictionary
    this.removeFromRoles(player);
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
