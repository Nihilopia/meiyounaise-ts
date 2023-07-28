import GuildRepo from "../db/GuildRepo.js";
import { Message } from "discord.js";
import { ArgsOf } from "discordx";
import { Container } from "typedi";
import { request } from "undici";
import * as spotify from "spotify-info";
import { respond } from "../util/general.js";

export class GuildHandlers {
  private static messages: {
    [id: string]: [msg: Message, count: number];
  } = {};

  static fmLog: {
    [channel: string]: string;
  } = {};

  static updateSongInChannel(channel: string, song: string) {
    this.fmLog[channel] = song;
  }

  static async onMemberAdd([event]: ArgsOf<"guildMemberAdd">) {
    const repo: GuildRepo = Container.get("guildRepo");
    const guild = await repo.guildById(event.guild.id);
    if (!guild || !guild.join_chn || !guild.join_msg) return;

    const channel = await event.guild.channels.fetch(guild.join_chn);
    if (!channel || !channel.isTextBased()) return;

    await channel.send(
      guild.join_msg.replaceAll("[user]", `<@${event.user.id}>`),
    );
  }

  static async onMemberRemove([event]: ArgsOf<"guildMemberRemove">) {
    const repo: GuildRepo = Container.get("guildRepo");
    const guild = await repo.guildById(event.guild.id);
    if (!guild || !guild.leave_chn || !guild.leave_msg) return;

    const channel = await event.guild.channels.fetch(guild.leave_chn);
    if (!channel || !channel.isTextBased()) return;

    await channel.send(
      guild.leave_msg.replaceAll("[user]", `@${event.user.username}`),
    );
  }

  static async repeatMessage([msg]: ArgsOf<"messageCreate">) {
    if (msg.author.bot) return;

    const repo: GuildRepo = Container.get("guildRepo");
    const guild = await repo.guildById(msg.guildId || "");
    if (!guild || guild.repeat_msg === 0) return;

    // init entry if it doesn't exist
    if (!this.messages[msg.channelId]) {
      this.messages[msg.channelId] = [msg, 1];
      return;
    }

    // increment/update if the content is the same and the author is different
    if (
      this.messages[msg.channelId][0].content === msg.content &&
      this.messages[msg.channelId][0].author !== msg.author
    ) {
      const count = this.messages[msg.channelId][1];
      this.messages[msg.channelId] = [msg, count + 1];
    } else {
      this.messages[msg.channelId] = [msg, 1];
    }

    // send the message if the count is reached
    if (this.messages[msg.channelId][1] >= guild.repeat_msg) {
      await msg.channel.send(msg.content);
      this.messages[msg.channelId] = [msg, 0];
    }
  }

  static async spotifyEmbed([msg]: ArgsOf<"messageCreate">) {
    const match = msg.content.match(
      /https?:\/\/open.spotify.com\/track\/[a-zA-Z0-9]+/,
    );

    if (!match) return;
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET)
      return;

    const repo: GuildRepo = Container.get("guildRepo");
    const guild = await repo.guildById(msg.guildId || "");
    if (!guild || !guild.embed_spotify) return;

    spotify.setApiCredentials(
      process.env.SPOTIFY_CLIENT_ID,
      process.env.SPOTIFY_CLIENT_SECRET,
    );

    const { previewUrl } = await spotify.getTrack(match[0]);
    if (!previewUrl) return;

    const res = await request(previewUrl).then((stream) =>
      stream.body.arrayBuffer(),
    );

    await respond(
      {
        files: [
          {
            name: "preview.mp3",
            attachment: Buffer.from(res),
          },
        ],
      },
      msg,
    );
  }
}
