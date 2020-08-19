import _ from "lodash";
import $ from "jquery";

import { Rect } from "shared/math";

/**
 * Resource loaders
 */
var Loaders = {};
Loaders["\.(?:png|jpg|jpeg)$"] = function(path) {
  return new Promise(resolve => {
    $("<img />").attr("src", path).load(e => resolve(e.target));
  });
};

/**
 * Canvas configuration from DOM element
 */
export default class Context {
  constructor(selector) {
    // Create canvas if DOM selector is not provided
    if(!selector) {
      this.domElement = $("<canvas />").prop({
          width: 700
        , height: 400
        , tabindex: 1
      })[0];
      $("body").append(this.domElement);

    // Query canvas from DOM if exists
    } else {
      this.domElement = $(selector)[0];
      if(!this.domElement)
        throw "Cannot find canvas!";
    }

    // Load font
    Context._loadFont("res/fonts/font.ttf", "Canvas Font");
    Context._loadFont("res/fonts/score.ttf", "Score Font");

    // Context
    this.ctx = this.domElement.getContext("2d");

    // Disable antialiasing
    this.ctx.imageSmoothingEnabled = false;
    $(this.domElement).css("image-rendering", "pixelated");

    // Get size of canvas
    let offset = $(this.domElement).offset();
    this.size = new Rect(
        offset.left
      , offset.top
      , $(this.domElement).width()
      , $(this.domElement).height()
    );

    // Context resources
    this.resources = {};

    // If resources are loading its true
    this.currentLoading = 0;
  }

  /** Load fonts by adding them to head */
  static _loadFont(url, title) {
    $(document.head).prepend(
      `<style type='text/css'>
        @font-face {
          font-family: '${title}';
          src: url('${url}') format('truetype');
        }
      </style>`
    );
  }

  /**
   * Draw line from p1 to p2
   * @param p1    Begin
   * @param p2    End
   * @param width Line width
   * @returns {Context}
   */
  strokeLine(p1, p2, width=3) {
    this.ctx.beginPath();
    this.ctx.lineWidth = width;
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.stroke();
    this.ctx.closePath();
    return this;
  }

  /**
   * Set font size
   * @param size      Font size
   * @param fontName  Font name
   * @returns {Context}
   */
  setFontSize(size=14, fontName="Canvas Font") {
    this.ctx.font = `${size}px '${fontName}'`;
    return this;
  }

  /**
   * Draw text
   * @param text  Text
   * @param pos   Text position
   * @returns {Context}
   */
  drawText(text, pos) {
    this.ctx.fillText(text, pos.x, pos.y + (pos.h || 0));
    return this;
  }

  /**
   * Get font size
   * @param text
   * @returns {Number}
   */
  textWidth(text) {
    return this.ctx.measureText(text).width;
  }

  /**
   * Set stroke color
   * @param color Stroke color
   * @returns {Context}
   */
  strokeWith(color) {
    this.ctx.strokeStyle = color.css || color;
    return this;
  }

  /**
   * Set fill color
   * @param color Fill color
   * @returns {Context}
   */
  fillWith(color) {
    this.ctx.fillStyle = color.css || color;
    return this;
  }

  /**
   * Draw filled rect
   * @param rect  Rectangle
   * @returns {Context}
   */
  fillRect(rect) {
    this.ctx.fillRect(
        rect.x
      , rect.y
      , rect.w
      , rect.h
    );
    return this;
  }

  /**
   * Draw stroked rect
   * @param rect    Rectangle
   * @param stroke  Line width
   * @returns {Context}
   */
  strokeRect(rect, stroke) {
    this.ctx.save();
    this.ctx.translate(.5, .5);
    this.ctx.lineWidth = stroke || 1;
    this.ctx.strokeRect(
        rect.x
      , rect.y
      , rect.w
      , rect.h
    );
    this.ctx.restore();
    return this;
  }

  /**
   * Stroke circle
   * @param pos     Position
   * @param r       Radius
   * @param stroke  Stroke
   * @returns {Context}
   */
  strokeCircle(pos, r, stroke) {
    this.ctx.beginPath();
    this.ctx.lineWidth = stroke;
    this.ctx.arc(pos.x, pos.y, r, 0, 2. * Math.PI);
    this.ctx.stroke();
    return this;
  }

  /**
   * Fill
   * @returns {Context}
   */
  fill() {
    this.ctx.fill();
    return this;
  }

  /**
   * Render sprite
   * @param resource  Resource name
   * @param rect      Position and size
   * @returns {Context}
   */
  drawImage(resource, rect) {
    if(!this.resources[resource])
      this.loadResource(resource, resource);
    else
      this.ctx.drawImage(this.resources[resource], rect.x, rect.y, rect.w, rect.h);
    return this;
  }

  /**
   * Loads resource, load only if required
   * @param id    Resource ID
   * @param path  Path to resource
   * @returns {Context}
   */
  loadResource(id, path) {
    _.each(Loaders, (loader, regex) => {
      // Load resource and assign to array
      if(new RegExp(regex).test(path)) {
        this.currentLoading++;
        loader(path)
          // Called after loading
          .then(resource => {
            this.resources[id] = resource;
            this.currentLoading--;
          });
      }
    });
    return this;
  }
}