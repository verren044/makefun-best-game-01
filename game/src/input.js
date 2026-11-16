// Keyboard + mouse input, translated into game intent. The world reads
// held keys each step and consumes edge-triggered presses (dash, flare,
// pause, menu keys) once, so a held key never double-fires.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, rightDown: false };
    this.mousePressed = false;
    this.mouseRightPressed = false;
    this._onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => { this.keys.clear(); this.mouse.down = false; this.mouse.rightDown = false; };
    this._onMouseMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      this.mouse.y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    };
    this._onMouseDown = (e) => {
      this._onMouseMove(e);
      if (e.button === 0) { this.mouse.down = true; this.mousePressed = true; }
      if (e.button === 2) { this.mouse.rightDown = true; this.mouseRightPressed = true; }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    };
    this._onContext = (e) => e.preventDefault();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('contextmenu', this._onContext);
  }

  // Movement vector from WASD or arrows, normalised.
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }

  get firing() { return this.mouse.down || this.keys.has('Space'); }

  wasPressed(code) { return this.pressed.has(code); }

  // Drop one edge press so two handlers in the same step cannot both see it.
  consume(code) { this.pressed.delete(code); }

  // Called at the end of each fixed step: edge presses live exactly one step.
  endStep() {
    this.pressed.clear();
    this.mousePressed = false;
    this.mouseRightPressed = false;
  }
}
