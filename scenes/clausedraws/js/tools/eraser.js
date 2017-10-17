/*
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

goog.provide('app.Eraser');
goog.require('app.Tool');


/**
 * Coloured spray tool
 * @constructor
 * @extends {app.Tool}
 * @param {!jQuery} $elem toolbox elem
 * @param {string} name The name of the color.
 */
app.Eraser = function($elem, name, offset) {
  app.Tool.call(this, $elem, name, offset);

  // This is a hidden image on the page that's used by the canvas
  this.soundKey = 'selfie_spray_small';
  this.points = [];
  this.dpr = 1;
};
app.Eraser.prototype = Object.create(app.Tool.prototype);

/**
 * [draw description]
 * @param  {[type]} context     [description]
 * @param  {[type]} mouseCoords [description]
 * @param  {[type]} scale       [description]
 * @return {[type]}             [description]
 */
app.Eraser.prototype.draw = function(canvas, mouseCoords, prevCanvas) {
  var context = canvas.getContext('2d');
  var drawX = mouseCoords.normX * canvas.width;
  var drawY = mouseCoords.normY * canvas.height;

  this.points.push({
      x: drawX,
      y: drawY
    });

  if (this.points.length > 1) {
    var gco = context.globalCompositeOperation;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(prevCanvas, 0, 0, canvas.width, canvas.height);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = 20;
    context.globalCompositeOperation = 'destination-out';
    context.strokeStyle = 'rgba(255, 255, 255, 255)';
    var p1 = this.points[0];
    var p2 = this.points[1];
    context.beginPath();
    context.moveTo(p1.x * this.dpr, p1.y * this.dpr);

    for (var i = 0; i < this.points.length - 1; i++) {
      p1 = this.points[i];
      p2 = this.points[i + 1];
      var midpoint = {
        x: p1.x + (p2.x - p1.x) / 2,
        y: p1.y + (p2.y - p1.y) / 2
      };

      context.quadraticCurveTo(
        p1.x * this.dpr,
        p1.y * this.dpr,
        midpoint.x * this.dpr,
        midpoint.y * this.dpr
      );
    }

    context.stroke();
    context.globalCompositeOperation = gco;
  }
  return true;
};


app.Eraser.prototype.reset = function() {
  this.points = [];
}


