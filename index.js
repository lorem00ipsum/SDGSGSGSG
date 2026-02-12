require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Events } = require("discord.js");
const Enmap = require("enmap");
const express = require("express");

// ======================
// EXPRESS pour Render / Replit
// ======================
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(PORT, () => console.log(`Web server started on port ${PORT}`));

// ======================
// Discord Client
// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ======================
// CONFIG / DB
// ======================
const TOKEN = process.env.TOKEN; // mets ton token dans les Variables Render ou .env
const ranks = ["Bronze","Silver","Gold","Platinum","Diamond","Champion","Unreal"];
const practiceLevels = ["Debutant","Intermediaire","Avance","Pro"];
const XP_PER_MESSAGE = 5;
const MUTE_DURATION = 5; // minutes par défaut
const SPAM_THRESHOLD = 5; // messages par 10 secondes

const db = new Enmap({ name: "database", autoFetch: true, fetchAll: false });
const userMessages = {}; // anti-spam

// ======================
// Bot Ready
// ======================
client.once(Events.ClientReady, () => {
  console.log(`🔥 Deaxty Bot connecté en tant que ${client.user.tag}`);
});

// ======================
// Leveling automatique & Anti-Spam
// ======================
client.on("messageCreate", async message => {
  if (message.author.bot) return;

  // Anti-spam simple
  if (!userMessages[message.author.id]) userMessages[message.author.id] = [];
  userMessages[message.author.id].push(Date.now());
  userMessages[message.author.id] = userMessages[message.author.id].filter(ts => Date.now() - ts < 10000);
  if (userMessages[message.author.id].length > SPAM_THRESHOLD) {
    let muteRole = message.guild.roles.cache.find(r => r.name === "Muted");
    if (!muteRole) muteRole = await message.guild.roles.create({ name: "Muted", permissions: [] });
    const member = await message.guild.members.fetch(message.author.id);
    await member.roles.add(muteRole);
    db.set(`mute_${member.id}`, Date.now() + MUTE_DURATION*60000);
    return message.channel.send(`🔇 ${member.user.tag} a été mute automatiquement pour spam.`);
  }

  // Leveling
  let xp = db.get(`xp_${message.author.id}`) || 0;
  xp += XP_PER_MESSAGE;
  db.set(`xp_${message.author.id}`, xp);

  const level = Math.floor(Math.sqrt(xp/10));
  const oldLevel = db.get(`level_${message.author.id}`) || 0;
  if (level > oldLevel) {
    db.set(`level_${message.author.id}`, level);
    message.channel.send(`🎉 ${message.author.tag} a atteint le niveau ${level} !`);
  }
});

// ======================
// Commandes Slash
// ======================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply({ ephemeral: false });

  try {
    const { commandName } = interaction;

    // ----------------------
    // MODERATION
    // ----------------------
    if (commandName === "ban") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.editReply("❌ Permission refusée");
      const user = interaction.options.getUser("user");
      await interaction.guild.members.ban(user);
      return interaction.editReply(`🔨 ${user.tag} a été banni.`);
    }

    if (commandName === "kick") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.editReply("❌ Permission refusée");
      const member = interaction.options.getMember("user");
      await member.kick();
      return interaction.editReply(`👢 ${member.user.tag} a été kick.`);
    }

    if (commandName === "clear") {
      const amount = interaction.options.getInteger("amount");
      await interaction.channel.bulkDelete(amount);
      return interaction.editReply(`🧹 ${amount} messages supprimés.`);
    }

    // ----------------------
    // MUTE / UNMUTE
    // ----------------------
    if (commandName === "mute") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.MuteMembers)) return interaction.editReply("❌ Permission refusée");
      const member = interaction.options.getMember("user");
      const duration = interaction.options.getInteger("duration") || MUTE_DURATION;
      let muteRole = interaction.guild.roles.cache.find(r => r.name === "Muted");
      if (!muteRole) muteRole = await interaction.guild.roles.create({ name: "Muted", permissions: [] });
      await member.roles.add(muteRole);
      db.set(`mute_${member.id}`, Date.now() + duration*60000);
      return interaction.editReply(`🔇 ${member.user.tag} est mute pour ${duration} minutes.`);
    }

    if (commandName === "unmute") {
      const member = interaction.options.getMember("user");
      let muteRole = interaction.guild.roles.cache.find(r => r.name === "Muted");
      if (muteRole) await member.roles.remove(muteRole);
      db.delete(`mute_${member.id}`);
      return interaction.editReply(`🔊 ${member.user.tag} est unmute.`);
    }

    // ----------------------
    // WARNS
    // ----------------------
    if (commandName === "warn") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.editReply("❌ Permission refusée");
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "Non spécifiée";
      let warns = db.get(`warns_${user.id}`) || [];
      warns.push({ reason, date: new Date().toISOString(), mod: interaction.user.tag });
      db.set(`warns_${user.id}`, warns);
      return interaction.editReply(`⚠️ ${user.tag} a été averti. Raison: ${reason}`);
    }

    if (commandName === "warns") {
      const user = interaction.options.getUser("user") || interaction.user;
      const warns = db.get(`warns_${user.id}`) || [];
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ Warns de ${user.tag}`)
        .setColor("Red")
        .setDescription(warns.length ? warns.map((w,i)=>`${i+1}. ${w.reason} par ${w.mod} le ${w.date}`).join("\n") : "Aucun warn");
      return interaction.editReply({ embeds: [embed] });
    }

    // ----------------------
    // RANK SYSTEM
    // ----------------------
    if (commandName === "setrank") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.editReply("❌ Permission refusée");
      const user = interaction.options.getUser("user");
      const rank = interaction.options.getString("rank");
      if (!ranks.includes(rank)) return interaction.editReply("❌ Rank invalide");
      db.set(`rank_${user.id}`, rank);
      let role = interaction.guild.roles.cache.find(r => r.name === rank);
      if (!role) role = await interaction.guild.roles.create({ name: rank });
      const member = await interaction.guild.members.fetch(user.id);
      await member.roles.add(role);
      return interaction.editReply(`🏆 ${user.tag} est maintenant ${rank}`);
    }

    // ----------------------
    // PRACTICE SYSTEM
    // ----------------------
    if (commandName === "practice") {
      const user = interaction.options.getUser("user");
      const level = interaction.options.getString("level");
      if (!practiceLevels.includes(level)) return interaction.editReply("❌ Niveau invalide");
      db.set(`practice_${user.id}`, level);
      let role = interaction.guild.roles.cache.find(r => r.name === level);
      if (!role) role = await interaction.guild.roles.create({ name: level });
      const member = await interaction.guild.members.fetch(user.id);
      await member.roles.add(role);
      return interaction.editReply(`🎯 ${user.tag} est maintenant niveau ${level}`);
    }

    // ----------------------
    // POINTS + PROFILE + LEADERBOARD
    // ----------------------
    if (commandName === "addpoints") {
      const user = interaction.options.getUser("user");
      const pts = interaction.options.getInteger("points");
      db.set(`points_${user.id}`, (db.get(`points_${user.id}`) || 0) + pts);
      return interaction.editReply(`➕ ${pts} points ajoutés à ${user.tag}`);
    }

    if (commandName === "profile") {
      const user = interaction.options.getUser("user") || interaction.user;
      const rank = db.get(`rank_${user.id}`) || "Non classé";
      const practice = db.get(`practice_${user.id}`) || "Non défini";
      const points = db.get(`points_${user.id}`) || 0;
      const level = db.get(`level_${user.id}`) || 0;
      const embed = new EmbedBuilder()
        .setTitle(`🎮 Profil Fortnite`)
        .addFields(
          { name: "Rank", value: rank, inline: true },
          { name: "Practice", value: practice, inline: true },
          { name: "Points", value: points.toString(), inline: true },
          { name: "Level", value: level.toString(), inline: true }
        ).setColor("Blue");
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === "leaderboard") {
      const allKeys = db.keyArray().filter(k => k.startsWith("points_"));
      const leaderboard = allKeys
        .map(k=>({ id: k.replace("points_",""), pts: db.get(k) }))
        .sort((a,b)=>b.pts - a.pts)
        .slice(0,10);
      const embed = new EmbedBuilder()
        .setTitle("🏆 Leaderboard")
        .setColor("Gold")
        .setDescription(leaderboard.map((u,i)=>`${i+1}. <@${u.id}> - ${u.pts} points`).join("\n") || "Aucun joueur");
      return interaction.editReply({ embeds: [embed] });
    }

    // ----------------------
    // PARTIES PRIVÉES
    // ----------------------
    if (commandName === "createparty") {
      const code = Math.random().toString(36).substring(2,8).toUpperCase();
      db.set(`party_${code}`, [interaction.user.id]);
      return interaction.editReply(`🎮 Partie privée créée ! Code : \`${code}\``);
    }

    if (commandName === "joinparty") {
      const code = interaction.options.getString("code");
      let party = db.get(`party_${code}`);
      if (!party) return interaction.editReply("❌ Partie inexistante");
      party.push(interaction.user.id);
      db.set(`party_${code}`, party);
      return interaction.editReply(`✅ Tu as rejoint la partie \`${code}\``);
    }

    // ----------------------
    // ANNOUNCE
    // ----------------------
    if (commandName === "announce") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.editReply("❌ Permission refusée");
      const channel = interaction.options.getChannel("channel");
      const messageText = interaction.options.getString("message");
      await channel.send(`📢 Annonce : ${messageText}`);
      return interaction.editReply("✅ Annonce envoyée");
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.editReply("❌ Une erreur est survenue.");
  }
});

// ======================
// Lancement du bot
// ======================
client.login(TOKEN);
