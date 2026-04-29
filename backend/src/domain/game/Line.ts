import { LineOrientation } from '@dab/shared';

export class Line {
  public readonly orientation: LineOrientation;
  public readonly x: number;
  public readonly y: number;

  constructor(orientation: LineOrientation, x: number, y: number) {
    this.orientation = orientation;
    this.x = x;
    this.y = y;
    Object.freeze(this);
  }

  public equals(other: Line): boolean {
    return (
      this.orientation === other.orientation &&
      this.x === other.x &&
      this.y === other.y
    );
  }

  public key(): string {
    return `${this.orientation}:${this.x}:${this.y}`;
  }
}
