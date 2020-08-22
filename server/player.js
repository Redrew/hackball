"use strict";
const validate = require("validate.js"),
  geoip = require("geoip-lite"),
  _ = require("lodash");

const { Room } = require("./room"),
  io = require("../app");

/**
 * Player socket class
 */
class Player {
  constructor(socket) {
    this.socket = socket;
    this.flags = 0;
    this.room = null;
    this.mouse_position_x = 0.0;
    this.mouse_position_y = 0.0;

    // Get global IP
    let ip = geoip.lookup(socket.request.connection.remoteAddress);
    this.country = ip ? ip.country.toLowerCase() : "ly";

    // Init listeners
    this._initListener();
  }

  /**
   * Init socket listeners
   * @private
   */
  _initListener() {
    let self = this;
    this.socket
      /** Manage flag */
      .on("addFlag", (flag) => (this.flags |= flag))
      .on("removeFlag", (flag) => (this.flags &= ~flag))

      /** Authorize to server */
      .on("setNick", (nick, fn) => {
        fn(
          this.setNick(nick) ? `Welcome ${nick}!` : { error: "Incorrect nick" }
        );
      })

      /** Create room on server */
      .on("createRoom", (data, fn) => {
        let validation = validate(data, {
          name: {
            presence: true,
            length: { minimum: 2, maximum: 34 },
          },
          players: { numericality: { lessThanOrEqualTo: 20 } },
        });
        if (validation || this.room) fn({ error: "Invalid form data!" });
        else {
          this.room = new Room(
            data.name,
            this,
            data.players,
            data.pass,
            data.hidden
          );
          fn(`Login to ${data.name} room as admin!`);
        }
      })

      /** List all rooms */
      .on("listRooms", function (data, fn) {
        fn(Room.headers());
      })

      /** Get room info before join */
      .on("askToConnect", function (data, fn) {
        let room = _.find(Room.list, data);
        if (!room || room.isFull()) fn({ error: "Cannot join :(" });
        else fn({ isLocked: room.isLocked() });

        /** Authorize to room */
        this.on("authorizeToRoom", (data, fn) => {
          if (room.checkPassword(data.pass)) {
            // AUTHORIZED TO ROOM!!!
            fn("Welcome in room :)");
            room.join(self);
          } else fn({ error: "Incorrect password!" });
        });
      })

      /** Set player team */
      .on("setTeam", (data) => {
        let player = Player.nick(data.nick);
        player && player.room.setTeam(player, data.team);
      })

      /** Leave from room */
      .on("roomLeave", (nick) => {
        this.room && this.room.leave(Player.nick(nick));
      })

      /** Kick player from room */
      .on("roomKick", (nick) => {
        this.room && this.room.kick(Player.nick(nick));
      })

      /** Room start */
      .on("roomStart", () => {
        this.room && this.room.start();
      })

      /** Move body */
      .on("move", (dir) => {
        if (this.body && this.body.v.length <= 1.8 && this.body.caughtCorona) this.body.v.add(dir, 0.35);
      })
      .on("mouse_position", (vec) => {
        this.mouse_position_x = vec.x;
        this.mouse_position_y = vec.y;
      })

      /** Ping pong for latency */
      .on("latency", (data, fn) => fn())

      /** Disconnect from server */
      .on("disconnect", _.partial(Player.remove, this));
  }

  /**
   * Set user nick, check if exists
   * @param nick  Nick
   * @returns true if not exists
   */
  setNick(nick) {
    if (!nick.length || !Player.isNickAvailable(nick)) return false;
    else return (this.nick = nick);
  }

  static isNickAvailable(nick) {
    return !_.find(Player.list, _.matchesProperty("nick", nick));
  }

  /**
   * Create player
   * @param socket  Player socket
   * @returns Player
   */
  static create(socket) {
    return Player.list.push(new Player(socket)) && _(Player.list).last();
  }

  /**
   * Remove player
   * @param player
   */
  static remove(player) {
    player.room && player.room.leave(player);
    _.remove(Player.list, player);
  }

  /**
   * Get player by nick
   * @param nick Player's nick
   * @returns Player
   */
  static nick(nick) {
    return _.find(Player.list, { nick: nick });
  }
}

/** Player flags */
Player.Flags = {
  KICK: 1 << 1,
};

/** List of all players */
Player.list = [];
io.on("connection", (socket) => {
  // Create player when is ready
  Player.create(socket);
  socket.emit("serverReady");
});

/** Export */
module.exports = Player;
