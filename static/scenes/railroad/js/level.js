goog.provide('app.Level');

goog.require('app.Scene');
goog.require('app.getElfImage');
goog.require('app.systems.CameraSystem');
goog.require('app.systems.RaycasterSystem');
goog.require('app.systems.PresentSystem');

/**
 * Handles everything that lives within one level.
 *
 * For each new level, and when the game is restarted, a new instance will be created.
 */
class Level {

  /**
   * @param {*} renderer ThreeJS renderer.
   * @param { function(number):void } addScore Function for adding to the game's score.
   */
  constructor(renderer, addScore) {
    this.scene = new app.Scene();
    this.camera = this.scene.getCamera();
    this.presentSystem = new app.PresentSystem(this.scene);
    this.raycasterSystem = new app.RaycasterSystem(renderer, this.camera, this.scene, addScore);
  }

  cleanUp() {
    // For the moment, it seems like nothing is actually needed here.
  }

  render(renderer) {
    renderer.render(this.scene.scene, this.camera);
  }

  update(deltaSeconds) {
    this.scene.update(deltaSeconds);
    this.presentSystem.update(deltaSeconds);
  }

  async handleClick(clientX, clientY) {
    const intersections = this.raycasterSystem.cast(clientX, clientY);

    if (intersections.length > 0) {
      const presentLanded = this.presentSystem.shoot(intersections[0].point);
      const targetObject = intersections[0].object;
      if (targetObject instanceof THREE.Sprite &&
          targetObject.userData.clickable &&
          targetObject.userData.clickable.type === 'elf' &&
          targetObject.userData.assetUrl !== undefined) {
        // Wait for the present to hit its target and then update the elf's sprite.
        await presentLanded;
        const textureWithPresent =
            getElfImage(targetObject.userData.assetUrl.replace('@', '_Holding@'));
        if (textureWithPresent) {
            targetObject.material.map = textureWithPresent;
        }
      }
    }
  }
}

app.Level = Level;
