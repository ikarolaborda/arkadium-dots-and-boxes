-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "nickname" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'WAITING',
    "grid_size" INTEGER NOT NULL,
    "host_id" UUID NOT NULL,
    "current_turn_seat_idx" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "winner_id" UUID,
    "draw" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "game_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "seat_index" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "disconnected_at" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("game_id","player_id")
);

-- CreateTable
CREATE TABLE "moves" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "player_id" UUID NOT NULL,
    "seat_index" INTEGER NOT NULL,
    "line_orientation" CHAR(1) NOT NULL,
    "line_x" INTEGER NOT NULL,
    "line_y" INTEGER NOT NULL,
    "completed_boxes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "players_nickname_idx" ON "players"("nickname");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");
CREATE INDEX "games_completed_at_idx" ON "games"("completed_at");
CREATE INDEX "games_winner_id_idx" ON "games"("winner_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_game_id_seat_index_key" ON "game_players"("game_id", "seat_index");
CREATE INDEX "game_players_player_id_idx" ON "game_players"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "moves_game_id_sequence_key" ON "moves"("game_id", "sequence");
CREATE INDEX "moves_game_id_idx" ON "moves"("game_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "games" ADD CONSTRAINT "games_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "moves" ADD CONSTRAINT "moves_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moves" ADD CONSTRAINT "moves_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
