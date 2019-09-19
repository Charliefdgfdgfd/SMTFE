/*
 * Copyright 2015 Google Inc. All rights reserved.
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

/*global google Modernizr */

goog.provide('app.Game');

goog.require('app.Constants');
goog.require('app.Country');
goog.require('app.levels');
goog.require('app.shared.Gameover');
goog.require('app.shared.LevelUp');
goog.require('app.shared.Scoreboard');
goog.require('app.shared.Tutorial');
goog.require('app.shared.utils');
goog.require('app.utils');

/**
 * Main game class
 * @param {!Element} elem A DOM element which wraps the game.
 * @constructor
 * @export
 */
app.Game = function(elem) {
  this.elem = $(elem);
  this.sceneElem = this.elem.find('.scene');
  this.mapElem = this.elem.find('.gmap');
  this.bgElem = this.elem.find('.bg');
  this.countriesElem = this.elem.find('.countries');

  this.scoreboard = new app.shared.Scoreboard(this,
      this.elem.find('.board'), app.Constants.TOTAL_LEVELS);
  this.gameoverView = new app.shared.Gameover(this, this.elem.find('.gameover'));
  this.levelUp = new app.shared.LevelUp(this,
      this.elem.find('.levelup'), this.elem.find('.levelup--number'));
  this.tutorial = new Tutorial(this.elem, 'touch-mercator mouse-mercator');

  this.debug = !!location.search.match(/[?&]debug=true/);
  this.mapReady = false;
  this.startOnReady = false;

  // Remove success messages on hide
  this.elem.on('animationend', '.country-match', function(event) {
    $(event.target).remove();
  });

  // Cache bound functions
  this.onFrame_ = this.onFrame_.bind(this);
  this.countryMatched_ = this.countryMatched_.bind(this);
  this.updateSize_ = this.updateSize_.bind(this);
  this.disableTutorial_ = this.disableTutorial_.bind(this);

  this.init_();
  this.initMap_();
};

/**
 * Disable the tutorial.
 * @private
 */
app.Game.prototype.disableTutorial_ = function(event) {
  if (event && $(event.target).closest('.start').length) {
    return;
  }
  this.tutorial.off('mouse-mercator');
  this.tutorial.off('touch-mercator');
};

/**
 * Start the game.
 */
app.Game.prototype.start = function() {
  // Wait for map to be ready
  if (!this.mapReady) {
    this.startOnReady = true;
    return;
  }

  this.restart();

  // Start tutorial
  this.tutorial.start();
  this.elem.on('click touchend', this.disableTutorial_);
};

/**
 * Initialize the game.
 * @private
 */
app.Game.prototype.init_ = function() {
  this.updateSize_();
  $(window).on('resize.mercator', this.updateSize_);
  $(window).on('orientationchange.mercator', this.updateSize_);

  var match = location.search.match(/[?&]level=(\d+)/) || [];
  this.level = (+match[1] || 1) - 1;

  this.countries && this.countries.forEach(function(country) {
    country.hide();
  });
};

/**
 * Restart the game.
 */
app.Game.prototype.restart = function() {
  this.init_();
  this.scoreboard.reset();
  this.scoreboard.setLevel(this.level);

  this.startLevel_();
  this.unfreezeGame();

  window.santaApp.fire('analytics-track-game-start', {gameid: 'mercator'});
};


/**
 * Freezes the game. Stops the onFrame loop and stops any CSS3 animations.
 * Used both for game over and pausing.
 * @param {boolean} hideMap
 */
app.Game.prototype.freezeGame = function(hideMap) {
  this.isPlaying = false;
  if (hideMap) {
    this.elem.addClass('frozen');
  }
};

/**
 * Unfreezes the game, starting the game loop as well.
 */
app.Game.prototype.unfreezeGame = function() {
  if (!this.isPlaying) {
    this.elem.removeClass('frozen').focus();

    this.isPlaying = true;
    this.lastFrame = +new Date() / 1000;
    this.requestId = window.requestAnimationFrame(this.onFrame_);
  }
};

/**
 * Pause the game.
 */
app.Game.prototype.pause = function() {
  this.paused = true;
  this.freezeGame(true);
};

/**
 * Resume the game.
 */
app.Game.prototype.resume = function() {
  this.paused = false;
  this.unfreezeGame();
};

/**
 * Game loop. Runs every frame using requestAnimationFrame.
 * @private
 */
app.Game.prototype.onFrame_ = function() {
  if (!this.isPlaying) {
    return;
  }

  // Calculate delta since last frame.
  var now = +new Date() / 1000;
  var delta = Math.min(1, now - this.lastFrame);
  this.lastFrame = now;

  this.levelElapsed += delta;
  this.scoreboard.onFrame(delta);

  // Request next frame
  this.requestId = window.requestAnimationFrame(this.onFrame_);
};

/**
 * Go to next level or end the game.
 * @param {boolean} won Is the game over?
 * @private
 */
app.Game.prototype.bumpLevel_ = function(won) {
  this.countries.forEach(function(country) {
    country.hide();
  });
  if (won) {
    this.gameover();
    window.santaApp.fire('sound-trigger', 'mercator_game_over');
    window.santaApp.fire('sound-trigger', 'music_ingame_gameover');
  } else {
    this.level++;
    this.scoreboard.setLevel(this.level);
    this.scoreboard.addTime(this.geodesic ?
        app.Constants.GEODESIC_TIME_PER_LEVEL :
        app.Constants.TIME_PER_LEVEL);
    this.startLevel_();
    window.santaApp.fire('sound-trigger', 'mercator_nextLevel');
  }
};

/**
 * Setup the level. Create countries and set bounds.
 * @private
 */
app.Game.prototype.setupLevel_ = function() {
  var data = app.levels[this.level];
  this.geodesic = app.Constants.GEODESIC_LEVELS.indexOf(this.level + 1) !== -1;
  this.countries = [];

  data.features.forEach(function(feature) {
    var country = new app.Country(this.map, feature, this.geodesic);
    country.onMatched = this.countryMatched_;
    country.onDrag = this.disableTutorial_;
    this.countries.push(country);
  }, this);

  this.mapBounds = new google.maps.LatLngBounds();
  this.mapBounds.extend(new google.maps.LatLng(data.bounds.s, data.bounds.w));
  this.mapBounds.extend(new google.maps.LatLng(data.bounds.n, data.bounds.e));
  this.map.fitBounds(this.mapBounds);

  if (this.debug) {
    this.mapBoundsRect && this.mapBoundsRect.setMap(null);
    this.mapBoundsRect = new google.maps.Rectangle({
      map: this.map,
      bounds: this.mapBounds,
      zIndex: 1
    });
  }

  // Show the whole world if geodesic puzzle.
  if (this.geodesic) {
    // FIXME(samthor): This is a hack to get slippy to show our tiles. Just accept it and remove
    // it in 2018 if all tiles load for geodesic.
    this.map.setZoom(0);
    window.setTimeout(() => {
      this.map.setZoom(3);
      window.requestAnimationFrame(() => this.updateSize_());
    }, 10);
  }
};

/**
 * Start a the level.
 * @private
 */
app.Game.prototype.startLevel_ = function() {
  this.setupLevel_();
  this.showCountries_();
  this.levelElapsed = 0;

  if (!this.paused) {
    this.unfreezeGame();
  }
};

/**
 * Show countries for current level in random places within the bounding box.
 * @private
 */
app.Game.prototype.showCountries_ = function() {
  var ne = app.utils.latLngToPoint(this.map, this.mapBounds.getNorthEast());
  var sw = app.utils.latLngToPoint(this.map, this.mapBounds.getSouthWest());
  var dX = sw.x - ne.x;
  var dY = sw.y - ne.y;

  // Don't place countries on the edges of the map
  dX -= ((app.Constants.MAP_BORDER) / 100) * dX;
  dY -= ((app.Constants.MAP_BORDER) / 100) * dY;
  ne.x += (app.Constants.MAP_BORDER / 100 / 2) * dX;
  ne.y += (app.Constants.MAP_BORDER / 100 / 2) * dY;

  var shown = 0;
  var total = this.level === 0 ?
      app.Constants.FIRST_LEVEL_VISIBLE_COUNTRIES :
      (this.geodesic ?
          app.Constants.GEODESIC_VISIBLE_COUNTRIES :
          app.Constants.VISIBLE_COUNTRIES);
  var total = this.level === 0 ? app.Constants.FIRST_LEVEL_VISIBLE_COUNTRIES :
      app.Constants.VISIBLE_COUNTRIES;
  while (shown < total) {
    var index = Math.floor(Math.random() * this.countries.length);
    var country = this.countries[index];
    if (country.visible) {
      continue;
    }

    var x = (Math.random() * dX) + ne.x;
    var y = (Math.random() * dY) + ne.y;

    var color = app.Constants.COUNTRY_COLORS[shown % app.Constants.COUNTRY_COLORS.length];
    country.setPosition(new google.maps.Point(x, y));
    country.show(color);
    shown++;

    if (this.debug) {
      country.showBounds();
    }
  }
};

/**
 * Calculate the score to give for a match.
 * @param {number} time The number of seconds from the start of the game.
 * @return {number}
 */
app.Game.prototype.getScore = function(time) {
  var score = app.Constants.SCORE_PER_COUNTRY;
  var multipliers = app.Constants.SCORE_MULTIPLIERS;
  var multiply = 1;

  for (var i = 0; i < multipliers.length; i++) {
    if (time < multipliers[i][0]) {
      multiply = multipliers[i][1];
      break;
    }
  }

  return score * multiply;
};

/**
 * Event handler for when a country is matched.
 * @param {!app.Country} country The country that was matched.
 * @private
 */
app.Game.prototype.countryMatched_ = function(country) {
  // Show the name of the country
  var point = app.utils.latLngToPoint(this.map, country.bounds.getCenter());
  var ne = app.utils.latLngToPoint(this.map, this.map.getBounds().getNorthEast());
  var sw = app.utils.latLngToPoint(this.map, this.map.getBounds().getSouthWest());

  var offset = {};
  if (country.geodesic) {
    // show in center
    offset.left = this.elem.width() / 2;
    offset.top = this.elem.height() / 2;
  } else {
    // only position on country in normal mode
    offset.left = (this.elem.width() - this.mapElem.width()) / 2 + point.x - sw.x;
    offset.top = (this.elem.height() - this.mapElem.height()) / 2 + point.y - ne.y;
  }

  var message = $(app.Constants.COUNTRY_MATCH_TEMPLATE).css(offset);
  var name = this.countriesElem.find('[data-country="' + country.name + '"]').first().text();
  message.find('.country-match-text').text(name);
  message.find('.country-match-bg').css('background', country.color);
  this.sceneElem.append(message);

  // Get score for the match
  this.scoreboard.addScore(this.getScore(this.levelElapsed));

  // Go to next level?
  var levelOver = this.countries.every(function(country) {
    return country.matched || !country.visible;
  });
  if (!levelOver) {
    return;
  }

  if (this.level === app.Constants.TOTAL_LEVELS - 1) {
    this.bumpLevel_(true);
  } else {
    this.freezeGame(false);
    window.setTimeout(function() {
      this.levelUp.show(this.level + 2, this.bumpLevel_.bind(this));
    }.bind(this), 1000);
  }
};

/**
 * Initialize Google Maps.
 * @private
 */
app.Game.prototype.initMap_ = function() {
  const styles = [
    {
      stylers: [{visibility: 'off'}],
    },
    {
      featureType: 'administrative.country',
      elementType: 'geometry.stroke',
      stylers: [{visibility: 'on'}, {weight: 1}, {color: '#F6EFE2'}],
    },
    {
      featureType: 'water',
      elementType: 'geometry.fill',
      stylers: [{visibility: 'on'}, {color: '#F6EFE2'}],
    },
    {
      featureType: 'landscape',
      elementType: 'geometry.fill',
      stylers: [{visibility: 'on'}, {color: '#DFD7C5'}],
    },
  ];

  this.map = new google.maps.Map(this.mapElem[0], {
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    gestureHandling: 'none',
    tilt: 1,
    disableDoubleClickZoom: true,
    disableDefaultUI: true,
    draggable: false,
    styles: styles,
  });

  google.maps.event.addListenerOnce(this.map, 'idle', () => {
    this.setupLevel_();
    this.mapReady = true;
    if (this.startOnReady) {
      this.start();
    }
  });
};

/**
 * Update on screen size change.
 * @private
 */
app.Game.prototype.updateSize_ = function() {
  this.map && this.map.fitBounds(this.mapBounds);
};

/**
 * Stops the game as game over. Displays the game over screen as well.
 */
app.Game.prototype.gameover = function() {
  this.freezeGame(false);
  this.gameoverView.show();
  window.santaApp.fire('sound-trigger', 'mercator_game_over');
  window.santaApp.fire('analytics-track-game-over', {
    gameid: 'mercator',
    score: this.scoreboard.score,
    level: this.level,
    timePlayed: new Date - this.gameStartTime
  });
};

/**
 * Cleanup
 * @export
 */
app.Game.prototype.dispose = function() {
  if (this.isPlaying) {
    window.santaApp.fire('analytics-track-game-quit', {
      gameid: 'mercator',
      timePlayed: new Date - this.gameStartTime,
      level: this.level
    });
  }
  this.freezeGame(false);

  window.cancelAnimationFrame(this.requestId);
  $(window).off('.mercator');
  $(document).off('.mercator');

  this.levelUp.dispose();
  this.tutorial.dispose();
};
