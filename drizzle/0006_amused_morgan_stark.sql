CREATE TYPE "public"."tournament_status" AS ENUM('live', 'finished', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."tournament_style" AS ENUM('rotating', 'fixed', 'knockout');--> statement-breakpoint
CREATE TABLE "tournament_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team_no" integer,
	CONSTRAINT "tournament_players_tournament_player" UNIQUE("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"style" "tournament_style" NOT NULL,
	"format" "format" NOT NULL,
	"ranked" boolean NOT NULL,
	"rounds" integer,
	"tables" integer DEFAULT 1 NOT NULL,
	"seed" integer NOT NULL,
	"status" "tournament_status" DEFAULT 'live' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "played_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "winner_side" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "ranked" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "tournament_id" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "round" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "slot" integer;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_players_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_tournament_round_slot" UNIQUE("tournament_id","round","slot");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_unplayed_needs_tournament" CHECK (winner_side IS NOT NULL OR tournament_id IS NOT NULL);--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_played_at_needs_tournament" CHECK (played_at IS NOT NULL OR tournament_id IS NOT NULL);--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_result_has_played_at" CHECK ((winner_side IS NULL) = (played_at IS NULL));--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_round_slot_need_tournament" CHECK ((round IS NULL AND slot IS NULL) OR tournament_id IS NOT NULL);