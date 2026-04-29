export class Box {
  public readonly x: number;
  public readonly y: number;
  public readonly ownerSeatIndex: number;

  constructor(x: number, y: number, ownerSeatIndex: number) {
    this.x = x;
    this.y = y;
    this.ownerSeatIndex = ownerSeatIndex;
    Object.freeze(this);
  }
}
