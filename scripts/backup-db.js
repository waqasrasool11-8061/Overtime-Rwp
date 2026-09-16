const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKUP_ROOT = path.join(ROOT_DIR, "backups");

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const targetFolder = path.join(BACKUP_ROOT, `backup-${timestamp}`);

if (!fs.existsSync(targetFolder)) {
  fs.mkdirSync(targetFolder, { recursive: true });
}

const filesToBackup = [
  path.join(ROOT_DIR, "data", "raw-data.sqlite"),
  path.join(ROOT_DIR, "data", "op72-raw-data.sqlite"),
  path.join(ROOT_DIR, "data", "employee-master.sqlite"),
  path.join(ROOT_DIR, "data", "holidays.json"),
  path.join(ROOT_DIR, "backend", "user_credentials.json"),
  path.join(ROOT_DIR, "backend", "chat_messages.json"),
];

let copied = 0;
for (const file of filesToBackup) {
  if (fs.existsSync(file)) {
    const filename = path.basename(file);
    const dest = path.join(targetFolder, filename);
    fs.copyFileSync(file, dest);
    console.log(`[backup] Copied ${filename} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
    copied += 1;
  }
}

console.log(`\nBackup completed successfully! ${copied} files backed up to:\n${targetFolder}\n`);
