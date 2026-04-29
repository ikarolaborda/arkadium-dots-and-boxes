import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateGameRequest {
  @IsString()
  @Length(1, 40)
  public nickname!: string;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(10)
  public gridSize?: number;
}
