// Virtual joystick input for phones / tablets (Walk and Fly modes have no mouse-look there).
export const touchInput = { x: 0, y: 0, up: 0 } // x: strafe (+right), y: forward (+), up: fly up (+) / down (-)
export function resetTouchInput() { touchInput.x = 0; touchInput.y = 0; touchInput.up = 0 }
