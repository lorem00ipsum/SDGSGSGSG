require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Events } = require("discord.js");
const mongoose = require("mongoose");
const express = require("express");

// ======================
// EXPRESS pour Render
// ======================
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(PORT, () => console.log(`Web server started on port ${PORT}`));

// ======================
// MongoDB
// ======================
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err));

// ======================
// Schemas MongoDB
// ======================
const userSchema = new mongoose.Schema({
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  rank: String,
  practice: String,
  warns: [{ reason: String, date: String, mod: String }],
  mutedUntil: Number
});

const partySchema = new mongoose.Schema({
  code: String,
  users: [String]
});

const User = mongoose.model("User", userSchema);
const Party = mongoose.model("Party", partySchema);

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
// CONFIG
// ======================
const TOKEN = process.env.TOKEN; // ton token Discord
const ranks = ["Bronze","Silver","Gold","Platinum","Diamond","Champion","Unreal"];
const practiceLevels = ["Debutant","Intermediaire","Avance","Pro"];
const XP_PER_MESSAGE = 5;
const MUTE_DURATION = 5; // minutes par défaut
const SPAM_THRESHOLD = 5; // messages par 10 secondes
const userMessages = {}; // anti-spam simple

// ======================
// Bot Ready
// ======================
client.once(Events.ClientReady, () => {
  console.log(`🔥 Bot connecté en tant que ${client.user.tag}`);
});

// ======================
// Leveling + Anti-Spam
// ======================
client.on("messageCreate", async message => {
  if (message.author.bot) return;

  // Anti-spam
  if (!userMessages[message.author.id]) userMessages[message.author.id] = [];
  userMessages[message.author.id].push(Date.now());
  userMessages[message.author.id] = userMessages[message.author.id].filter(ts => Date.now() - ts < 10000);
  if (userMessages[message.author.id].length > SPAM_THRESHOLD) {
    const muteRole = message.guild.roles.cache.find(r => r.name === "Muted") 
                      || await message.guild.roles.create({ name: "Muted", permissions: [] });
    const member = await message.guild.members.fetch(message.author.id);
    await member.roles.add(muteRole);
    await User.findOneAndUpdate({ userId: member.id }, { mutedUntil: Date.now() + MUTE_DURATION*60000 }, { upsert: true });
    return message.channel.send(`🔇 ${member.user.tag} mute pour spam.`);
  }

  // Leveling
  const user = await User.findOneAndUpdate(
    { userId: message.author.id },
    { $inc: { xp: XP_PER_MESSAGE } },
    { upsert: true, new: true }
  );
  const level = Math.floor(Math.sqrt(user.xp / 10));
  if (level > user.level) {
    user.level = level;
    await user.save();
    message.channel.send(`🎉 ${message.author.tag} a atteint le niveau ${level} !`);
  }
});

// ======================
// Commandes Slash
// ======================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply();

  try {
    const { commandName } = interaction;

    // =====================
    // Exemple : addpoints
    // =====================
    if (commandName === "addpoints") {
      const user = interaction.options.getUser("user");
      const pts = interaction.options.getInteger("points");
      const dbUser = await User.findOneAndUpdate({ userId: user.id }, { $inc: { points: pts } }, { upsert: true, new: true });
      return interaction.editReply(`➕ ${pts} points ajoutés à ${user.tag}`);
    }

    // Ici tu peux ajouter toutes les autres commandes du bot
    // kick, ban, mute, unmute, setrank, practice, warns, leaderboard, createparty, joinparty, announce, profile...
    // en remplaçant db.get/db.set/db.add par Mongoose (findOne, findOneAndUpdate, save, etc.)

  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.editReply("❌ Une erreur est survenue.");
  }
});

// ======================
// Lancement
// ======================
client.login(TOKEN);
