import Phaser from 'phaser'

export type RatioRect = {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
}

export function createRatioRectangle(
  width: number,
  height: number,
  { xRatio, yRatio, widthRatio, heightRatio }: RatioRect,
  originX = 0,
  originY = 0,
) {
  return new Phaser.Geom.Rectangle(
    originX + xRatio * width,
    originY + yRatio * height,
    widthRatio * width,
    heightRatio * height,
  )
}

export function isPointInRectangle(rectangle: Phaser.Geom.Rectangle, x: number, y: number) {
  return Phaser.Geom.Rectangle.Contains(rectangle, x, y)
}

export function getRectangleEntryState(
  rectangle: Phaser.Geom.Rectangle,
  x: number,
  y: number,
  wasInside: boolean,
) {
  const isInside = isPointInRectangle(rectangle, x, y)
  return {
    isInside,
    didEnter: isInside && !wasInside,
  }
}
