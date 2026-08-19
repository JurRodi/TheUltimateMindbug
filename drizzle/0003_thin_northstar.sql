CREATE TYPE "public"."mvp_status" AS ENUM('open', 'decided', 'void');--> statement-breakpoint
CREATE TABLE "mvp_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" "mvp_status" DEFAULT 'open' NOT NULL,
	"decided_at" timestamp with time zone,
	"open_notified_at" timestamp with time zone,
	"reminder_notified_at" timestamp with time zone,
	"result_notified_at" timestamp with time zone,
	CONSTRAINT "mvp_rounds_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "mvp_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"voter_id" integer NOT NULL,
	"nominee_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mvp_votes_game_voter" UNIQUE("game_id","voter_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "mvp_rounds" ADD CONSTRAINT "mvp_rounds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mvp_votes" ADD CONSTRAINT "mvp_votes_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mvp_votes" ADD CONSTRAINT "mvp_votes_voter_id_players_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mvp_votes" ADD CONSTRAINT "mvp_votes_nominee_id_players_id_fk" FOREIGN KEY ("nominee_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;