import dotenv from "dotenv";

dotenv.config();

const server = process.env.NTFY_URL || "https://ntfy.sh";
const topic = process.env.NTFY_TOPIC || "spurti-announcements";

const today = new Date().toLocaleDateString("en-IN", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const message = `🏆 Spurti Daily Update

Your SP has been updated.

Open Spurti to see your latest:
• SP
• Rank
• Level`;

try {
  const response = await fetch(`${server}/${topic}`, {
    method: "POST",
    headers: {
        Title: "Spurti Daily Update",
        Priority: "3",
        Tags: "trophy",
},
    body: message,
  });

  console.log(`Notification sent. Status: ${response.status}`);
} catch (err) {
  console.error("Failed to send notification:", err.message);

  // Don't crash the pipeline
  process.exit(0);
}