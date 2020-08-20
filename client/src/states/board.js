import _ from "lodash";

import { Layer, State } from "../engine/object";
import { Rect, Vec2 } from "shared/math";
import Color from "shared/color";

import { Sprite } from "../engine/wrapper";
import Popup from "../ui/popup";

import { Button } from "../ui/button";
import { Text } from "../engine/wrapper";

// import ListBox from "../ui/listbox";
import Table from "../ui/table";
// import TextBox from "../ui/textbox";

import Message from "../engine/message";
import Client from "../multiplayer/client";

/**
 * Core game state, it shows rooms gameplay
 * @class
 */
export default class Board extends State {
  constructor() {
    super(Layer.BorderBox);
  }

  /** @inheritdoc */
  get assets() {
    return {
      tile: "res/tile.png",
    };
  }

  /**
   * Get room listeners
   */
  get listeners() {
    let listeners = {};
    // Fetch all players from all teams
    listeners["roomSettings"] = (data) => {
      // Load player  panel
      this.settings.disableAdminPanel(data.admin !== Client.user.nick);
      _.each(this.settings.teams, (listBox, key) =>
        listBox.setRows(data.teams[key] || [])
      );

      // Get board list
      this.projector.board.xywh = data.board;
      this.projector.goals = data.goals;
    };

    // Room score
    listeners["roomScore"] = (data) => {
      _.each(data, (val, key) => {
        this.projector.goals[key].score = val;
      });
    };

    // Fetch joining player
    listeners["roomPlayerJoin"] = (data) => {
      this.settings.teams[data.team].add(data.nick);
    };

    // Fetch leaving player
    listeners["roomPlayerLeave"] = (data) => {
      this.settings.teams[data.team].remove(data.nick);
    };

    // Kick from room
    listeners["roomKick"] = (message) => {
      Popup.confirm(this, message).then(this._showRoomList.bind(this));
    };

    // Get room changes
    listeners["roomUpdate"] = (data) => {
      if (this.projector)
        this.projector.children = _.chunk(new Float32Array(data), 4);
      console.log(this.projector.children);
    };

    return listeners;
  }

  /**
   * Return to room list and clear all data
   * @private
   */
  _showRoomList() {
    this.canvas.setState("roomList").reloadRoomList();
    this.projector.clear();
  }

  /** @inheritdoc */
  init() {
    this.settings = new Board.SettingsPopup();

    // Renderer, it should be under UI!
    this.projector = this.add(new Board.Projector(), {
      align: [0, 0],
      fill: [1, 1],
    });

    // UI buttons
    this.add(new Button(new Rect(0, 0, 100, 16), "Exit"), {
      align: [0, 1],
    }).addForwarder(Message.Type.MOUSE_CLICK, () => {
      Client.emit("roomLeave", Client.user.nick);
      this._showRoomList();
    });

    this.add(new Button(new Rect(0, 0, 100, 16), "Options"), {
      align: [1, 1],
    }).addForwarder(
      Message.Type.MOUSE_CLICK,
      this.showPopup.bind(this, this.settings)
    );
  }
}

/** Bind keyCode to direction */
Board.keyBindings = {
  87: [0, -1] /** W */,
  83: [0, 1] /** S */,
  68: [1, 0] /** D */,
  65: [-1, 0] /** A */,
};

/**
 * Render whole map
 * @class
 */
Board.Projector = class extends Layer {
  init() {
    this.eventForwarding = false;

    this.tile = new Sprite(new Rect(0, 0, 16, 16), "tile", new Vec2(4, 1));
    this.tile2 = new Sprite(new Rect(0, 0, 16, 16), "tile", new Vec2(4, 1));
    this.prev_mouse_pos_x = 0.0;
    this.prev_mouse_pos_y = 0.0;
    this.board = new Rect();
  }

  /** @inherticdoc */
  draw(context) {
    let ctx = context.ctx;
    ctx.save();
    ctx.translate(this.rect.w / 2 - this.board.w / 2, 50);

    // Render board
    context
      .strokeWith(Color.Hex.DARK_GRAY)

      .strokeRect(this.board, 2)
      .strokeLine(
        new Vec2(this.board.w / 2, this.board.h),
        new Vec2(this.board.w / 2, 0),
        2
      );

    // Render goals
    // context.strokeWith(Color.Hex.WHITE);
    // _.each(this.goals, goal => {
    //   let w = goal.size * goal.sign;

    //   ctx.beginPath();
    //   ctx.lineWidth = 2;

    //   // Top rounded border
    //   ctx.moveTo(goal.p1[0], goal.p1[1]);
    //   ctx.quadraticCurveTo(goal.p1[0] + w, goal.p1[1], goal.p1[0] + w, goal.p1[1] + goal.size);

    //   // Line between
    //   ctx.moveTo(goal.p1[0] + w , goal.p1[1] + goal.size);
    //   ctx.lineTo(goal.p2[0] + w , goal.p2[1] - goal.size);

    //   // Bottom rounded border
    //   ctx.moveTo(goal.p2[0], goal.p2[1]);
    //   ctx.quadraticCurveTo(goal.p2[0] + w, goal.p2[1], goal.p2[0] + w, goal.p2[1] - goal.size);

    //   ctx.stroke();

    //   // Draw circles
    //   context
    //     .fillWith("#ffffff")

    //     .strokeCircle(new Vec2(goal.p1[0], goal.p1[1]), 8)
    //     .fill()

    //     .strokeCircle(new Vec2(goal.p2[0], goal.p2[1]), 8)
    //     .fill();
    // });

    // Render players
    context.setFontSize(16);
    _.each(this.children, (player, index) => {
      console.log(player);
      if (player.length == 6) {
        if (player[4] != 0.0 && player[5] != 0.0) {
          this.prev_mouse_pos_x = player[4];
          this.prev_mouse_pos_y = player[5];
        }

        player.pop();
        player.pop();
      }
      let isBall = player[3] & 0b100;
      // Position
      this.tile.rect.xy = player;
      this.tile.rect.w = this.tile.rect.h = player[2] * 2;

      // Render sprite
      this.tile.tileIndex.xy = [isBall ? 1 : player[3] & 0b011, 0];
      this.tile.draw(context);

      // Draw index
      if (!isBall) {
        var newarray = player.slice();
        newarray[2] = 12;
        var delta_x = this.prev_mouse_pos_x - newarray[0];
        var delta_y = this.prev_mouse_pos_y - newarray[1];
        var ratio = delta_x / delta_y;
        newarray[0] = newarray[0] + delta_x;
        newarray[1] = newarray[1] + delta_y;
        newarray[3] = 4;
        this.tile2.rect.xy = newarray;
        this.tile2.rect.w = this.tile2.rect.h = newarray[2] * 2;
        this.tile2.tileIndex.xy = [!isBall ? 1 : newarray[3] & 0b011, 0];
        this.tile2.draw(context);

        context
          .fillWith(Color.Hex.WHITE)
          .drawText(
            index,
            new Vec2(
              this.tile.rect.x + player[2] - 5,
              this.tile.rect.y + this.tile.rect.h - 7
            )
          );
      }
      // Check flags
      let flags = (player[3] >> 3) & 0b111;
      if (flags & 2)
        context
          .strokeWith(Color.Hex.WHITE)
          .strokeCircle(
            new Vec2(
              this.tile.rect.x + player[2],
              this.tile.rect.y + player[2]
            ),
            player[2],
            4
          );
    });

    ctx.restore();

    // Render score
    if (this.goals) {
      let text = `${this.goals[0].score} : ${this.goals[2].score}`;
      context.fillWith(Color.Hex.WHITE).setFontSize(60, "Score Font");

      let textWidth = context.textWidth(text),
        scorePos = this.rect.w / 2 - textWidth / 2;

      context
        .drawText(text, new Vec2(scorePos, 25))

        .fillWith("#e20000")
        .fillRect(new Rect(scorePos - 80, 5, 38, 28))

        .fillWith("#4b71ff")
        .fillRect(new Rect(scorePos + textWidth + 42, 5, 38, 28));
    }
  }

  /** @inheritdoc */
  onEvent(event) {
    if (event.isKeyboardEvent()) {
      let flag = 0;
      switch (event.data) {
        /** Space */
        case 32:
          flag = 1 << 1;
          break;
      }

      // Add flag when key pressed, remove when released
      switch (event.type) {
        case Message.Type.KEY_DOWN:
          Client.emit("addFlag", flag);
          break;
        case Message.Type.KEY_UP:
          Client.emit("removeFlag", flag);
          break;
      }
    } else if (event.isMouseEvent()) {
      switch (event.type) {
        case Message.Type.MOUSE_MOVE:
          Client.emit("mouse_position", event.data);
          break;
      }
    }
  }

  /** @inheritdoc */
  update() {
    // Merge multiple request to one by adding direction params
    let dir = new Vec2();
    _.each(Board.keyBindings, (direction, keyCode) => {
      this.canvas.pressedKeys[keyCode] && dir.add(direction);
    });

    // Send to server input
    if (dir.x || dir.y) Client.emit("move", dir.xy);
  }
};

/**
 * Settings popup showed after pressing right corner button
 * @class
 */
Board.SettingsPopup = class extends Popup {
  constructor() {
    super(Layer.VBox, new Rect(0, 0, 500, 300), "Room settings");
  }

  /**
   * Get selected player from teams listBoxes
   * @returns {Player}
   */
  get selectedPlayer() {
    return (
      _.chain(this.teams)
        // Flatten listBox list
        .values()

        // Map listBox selected values and remove null
        .map((table) => table.listbox.selected)
        .filter((element) => element)

        // Get first from array
        .thru(_.partial(_.get, _, 0))
        .value()
    );
  }

  /**
   * Move player to new team
   * @param next  Next team eg. 1 is next to current, -1 is previous team
   * @private
   */
  _changeTeam(next) {
    _.each(this.teams, (table, index) => {
      let selected = table.listbox.selected,
        newTeam = index + next;

      // Move selected to other team
      if (selected && this.teams[newTeam]) {
        Client.emit("setTeam", {
          nick: selected,
          team: newTeam,
        });
        return false;
      }
    });
  }

  /**
   * Disable admin panel
   * @param disabled  True if disable
   */
  disableAdminPanel(disabled) {
    this.userPanel.disabled = this.matchPanel.disabled = disabled;
    return this;
  }

  /**
   * Create user management panel
   * @private
   */
  _createUserPanel() {
    this.userPanel = this.toolbox.add(new Layer(Layer.HBox), {
      fill: [1, 0.2],
    });
    this.userPanel
      .add(new Button(new Rect(), "<"), { fill: [0.5, 1] })
      .addForwarder(Message.Type.MOUSE_CLICK, this._changeTeam.bind(this, -1));

    this.userPanel
      .add(new Button(new Rect(), ">"), { fill: [0.5, 1] })
      .addForwarder(Message.Type.MOUSE_CLICK, this._changeTeam.bind(this, 1));

    return this;
  }

  /**
   * Create user management panel
   * @private
   */
  _createMatchPanel() {
    this.matchPanel = this.add(new Layer(Layer.HBox, new Rect(0, 0, 0, 20)), {
      fill: [1, 0],
    });
    this.matchPanel
      .add(new Button(new Rect(0, 0, 64, 0), "Kick"), { fill: [0, 1] })
      .addForwarder(Message.Type.MOUSE_CLICK, () => {
        Client.emit("roomKick", this.selectedPlayer);
      });

    // Begin game
    this.matchPanel
      .add(new Button(new Rect(0, 0, 64, 0), "Start"), { fill: [0, 1] })
      .addForwarder(
        Message.Type.MOUSE_CLICK,
        _.partial(Client.emit, "roomStart", null)
      );

    this.matchPanel
      .add(new Button(new Rect(0, 0, 64, 0), "Medic"), { fill: [0, 1] })
      .addForwarder(Message.Type.MOUSE_CLICK, () => {
        console.log("Make medic");
      });

    this.matchPanel
      .add(new Button(new Rect(0, 0, 64, 0), "Jacinta"), { fill: [0, 1] })
      .addForwarder(Message.Type.MOUSE_CLICK, () => {
        console.log("Make Jacinta");
      });
    return this;
  }

  /**
   * Create teams panel
   * @private
   */
  _createTeamsPanel() {
    let teamsBox = this.add(new Layer(Layer.HBox, new Rect(0, 0, 0, 200)), {
      fill: [1, 0.0],
    });

    // Left
    this.teams = [];
    this.teams[0] = teamsBox.add(new Table([["Left", 1.0]]), {
      fill: [0.33, 1],
    });

    // Toolbox
    this.toolbox = teamsBox.add(new Layer(Layer.VBox), { fill: [0.34, 1] });
    this.teams[1] = this.toolbox.add(new Table([["Spectators", 1]]), {
      fill: [1, 0.8],
    });

    // Right
    this.teams[2] = teamsBox.add(new Table([["Right", 1]]), {
      fill: [0.33, 1],
    });
    return this;
  }

  /** @inheritdoc */
  init() {
    this._createTeamsPanel()
      ._createMatchPanel()
      ._createUserPanel()
      .makeCloseable();
  }
};
