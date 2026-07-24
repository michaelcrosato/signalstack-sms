import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const BACKUP_MAGIC_HEADER = "SSMS_BACKUP_V1\n";
export const BACKUP_MAGIC_BYTES_LENGTH = Buffer.byteLength(BACKUP_MAGIC_HEADER, "utf8");

export type BackupMetadata = Readonly<{
  version: number;
  algorithm: "aes-256-gcm";
  createdAt: string;
  iv: string;
  tag: string;
  checksum: string;
  payloadSize: number;
  database?: string;
  compressed?: boolean;
}>;

export type BackupHeader = Readonly<{
  metadata: BackupMetadata;
  headerLength: number;
  totalHeaderOffset: number;
}>;

export type BackupOptions = Readonly<{
  outputPath?: string;
  databaseUrl?: string;
  encryptionKey?: string | Buffer;
  dryRun?: boolean;
  inputPayload?: Buffer;
}>;

export type RestoreOptions = Readonly<{
  inputPath?: string;
  inputBuffer?: Buffer;
  databaseUrl?: string;
  encryptionKey?: string | Buffer;
  dryRun?: boolean;
  onRestoreSql?: (sql: string) => void;
}>;

export type VerifyOptions = Readonly<{
  inputPath?: string;
  inputBuffer?: Buffer;
  encryptionKey?: string | Buffer;
}>;

export type BackupResult = Readonly<{
  outputPath?: string;
  backupBuffer: Buffer;
  metadata: BackupMetadata;
}>;

export type RestoreResult = Readonly<{
  success: boolean;
  restoredSize: number;
  checksum: string;
  metadata: BackupMetadata;
  restoredContent?: string;
}>;

export type VerifyResult = Readonly<{
  valid: boolean;
  metadata: BackupMetadata;
  checksumMatches: boolean;
}>;

/**
 * Derive a 32-byte Buffer key for AES-256-GCM.
 */
export function deriveEncryptionKey(keyInput?: string | Buffer): Buffer {
  const rawKey =
    keyInput ??
    process.env.BACKUP_ENCRYPTION_KEY ??
    process.env.SECRETS_MASTER_KEY ??
    "default-signalstack-dev-backup-key-32bytes!";

  if (Buffer.isBuffer(rawKey)) {
    if (rawKey.length !== 32) {
      throw new Error(`Encryption key Buffer must be 32 bytes; received ${rawKey.length} bytes.`);
    }
    return rawKey;
  }

  const trimmed = rawKey.trim();

  // If 64 hex characters (256 bits)
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  // If 32-byte Base64 string
  if (/^[A-Za-z0-9+/]{43}=?$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === 32) {
      return buf;
    }
  }

  // Otherwise, derive 32 bytes via scrypt
  return scryptSync(trimmed, "signalstack-sms-backup-salt", 32);
}

/**
 * Encrypt unencrypted payload into structured backup file format:
 * [MAGIC (15B)][HEADER_LEN (4B uint32BE)][HEADER_JSON][CIPHERTEXT]
 */
export function encryptPayload(
  plaintext: Buffer,
  keyInput?: string | Buffer,
  customMetadata: Partial<BackupMetadata> = {}
): BackupResult {
  const key = deriveEncryptionKey(keyInput);
  const iv = randomBytes(12);
  const checksum = createHash("sha256").update(plaintext).digest("hex");

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const metadata: BackupMetadata = Object.freeze({
    version: 1,
    algorithm: "aes-256-gcm",
    createdAt: customMetadata.createdAt ?? new Date().toISOString(),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    checksum,
    payloadSize: plaintext.length,
    database: customMetadata.database ?? "signalstack_sms",
    compressed: customMetadata.compressed ?? false
  });

  const jsonBuf = Buffer.from(JSON.stringify(metadata), "utf8");
  const headerLenBuf = Buffer.alloc(4);
  headerLenBuf.writeUInt32BE(jsonBuf.length, 0);

  const magicBuf = Buffer.from(BACKUP_MAGIC_HEADER, "utf8");
  const backupBuffer = Buffer.concat([magicBuf, headerLenBuf, jsonBuf, ciphertext]);

  return { backupBuffer, metadata };
}

/**
 * Parse and validate the backup header from a backup Buffer.
 */
export function parseBackupHeader(buffer: Buffer): BackupHeader {
  if (buffer.length < BACKUP_MAGIC_BYTES_LENGTH + 4) {
    throw new Error("Invalid backup file: file buffer too short for backup header.");
  }

  const magic = buffer.subarray(0, BACKUP_MAGIC_BYTES_LENGTH).toString("utf8");
  if (magic !== BACKUP_MAGIC_HEADER) {
    throw new Error(`Invalid backup header: magic bytes mismatch. Expected '${BACKUP_MAGIC_HEADER.trim()}', got '${magic.trim()}'`);
  }

  const headerLength = buffer.readUInt32BE(BACKUP_MAGIC_BYTES_LENGTH);
  const totalHeaderOffset = BACKUP_MAGIC_BYTES_LENGTH + 4 + headerLength;

  if (buffer.length < totalHeaderOffset) {
    throw new Error("Invalid backup file: truncated header JSON payload.");
  }

  const jsonStr = buffer.subarray(BACKUP_MAGIC_BYTES_LENGTH + 4, totalHeaderOffset).toString("utf8");
  let metadata: BackupMetadata;
  try {
    metadata = JSON.parse(jsonStr);
  } catch (error) {
    throw new Error(`Invalid backup header: JSON parse error (${error instanceof Error ? error.message : String(error)})`);
  }

  if (metadata.version !== 1 || metadata.algorithm !== "aes-256-gcm" || !metadata.iv || !metadata.tag || !metadata.checksum) {
    throw new Error("Invalid backup header: missing required metadata fields.");
  }

  return { metadata, headerLength, totalHeaderOffset };
}

/**
 * Decrypt backup buffer using provided key and verify auth tag & payload checksum.
 */
export function decryptPayload(
  backupBuffer: Buffer,
  keyInput?: string | Buffer
): { plaintext: Buffer; metadata: BackupMetadata } {
  const { metadata, totalHeaderOffset } = parseBackupHeader(backupBuffer);
  const key = deriveEncryptionKey(keyInput);

  const iv = Buffer.from(metadata.iv, "hex");
  const tag = Buffer.from(metadata.tag, "hex");
  const ciphertext = backupBuffer.subarray(totalHeaderOffset);

  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Decryption failed: invalid key or tampered ciphertext.");
  }

  const computedChecksum = createHash("sha256").update(plaintext).digest("hex");
  if (computedChecksum !== metadata.checksum) {
    throw new Error(`Checksum validation failed: payload corruption detected. Expected ${metadata.checksum}, calculated ${computedChecksum}`);
  }

  return { plaintext, metadata };
}

/**
 * Programmatically create an encrypted database backup.
 */
export async function createEncryptedBackup(options: BackupOptions = {}): Promise<BackupResult> {
  let dumpPayload: Buffer;

  if (options.inputPayload) {
    dumpPayload = options.inputPayload;
  } else if (options.dryRun) {
    dumpPayload = Buffer.from(
      `-- SignalStack SMS Mock Database Dump\n-- Created: ${new Date().toISOString()}\nCREATE TABLE mock_schema (id INT PRIMARY KEY);\nINSERT INTO mock_schema VALUES (1);\n`,
      "utf8"
    );
  } else {
    // Execute real pg_dump
    const dbUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? "postgresql://signalstack:signalstack@localhost:5432/signalstack_sms";
    try {
      dumpPayload = execFileSync("pg_dump", ["--clean", "--if-exists", "--no-owner", dbUrl], {
        maxBuffer: 50 * 1024 * 1024
      });
    } catch (error) {
      throw new Error(`pg_dump failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result = encryptPayload(dumpPayload, options.encryptionKey);

  if (options.outputPath) {
    writeFileSync(resolve(options.outputPath), result.backupBuffer);
    return { ...result, outputPath: resolve(options.outputPath) };
  }

  return result;
}

/**
 * Programmatically restore an encrypted database backup.
 */
export async function restoreEncryptedBackup(options: RestoreOptions = {}): Promise<RestoreResult> {
  let backupBuffer: Buffer;

  if (options.inputBuffer) {
    backupBuffer = options.inputBuffer;
  } else if (options.inputPath) {
    backupBuffer = readFileSync(resolve(options.inputPath));
  } else {
    throw new Error("Restore failed: inputPath or inputBuffer is required.");
  }

  const { plaintext, metadata } = decryptPayload(backupBuffer, options.encryptionKey);
  const sqlString = plaintext.toString("utf8");

  if (options.onRestoreSql) {
    options.onRestoreSql(sqlString);
  }

  if (!options.dryRun && !options.onRestoreSql) {
    const dbUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? "postgresql://signalstack:signalstack@localhost:5432/signalstack_sms";
    try {
      execFileSync("psql", [dbUrl], {
        input: plaintext,
        maxBuffer: 50 * 1024 * 1024
      });
    } catch (error) {
      throw new Error(`pg_restore/psql failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    success: true,
    restoredSize: plaintext.length,
    checksum: metadata.checksum,
    metadata,
    restoredContent: sqlString
  };
}

/**
 * Verify backup header and payload integrity.
 */
export async function verifyEncryptedBackup(options: VerifyOptions): Promise<VerifyResult> {
  let backupBuffer: Buffer;
  if (options.inputBuffer) {
    backupBuffer = options.inputBuffer;
  } else if (options.inputPath) {
    backupBuffer = readFileSync(resolve(options.inputPath));
  } else {
    throw new Error("Verify failed: inputPath or inputBuffer is required.");
  }

  const { metadata } = decryptPayload(backupBuffer, options.encryptionKey);
  return {
    valid: true,
    metadata,
    checksumMatches: true
  };
}

// CLI entry point
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";

  const getArgValue = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const arg = args.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  const isDryRun = args.includes("--dry-run");
  const outPath = getArgValue("out");
  const inPath = getArgValue("in");
  const key = getArgValue("key");
  const dbUrl = getArgValue("db-url");

  (async () => {
    try {
      if (command === "backup") {
        const result = await createEncryptedBackup({
          outputPath: outPath ?? "backups/signalstack-backup.dump",
          databaseUrl: dbUrl,
          encryptionKey: key,
          dryRun: isDryRun
        });
        console.log(`Backup successfully created!`);
        console.log(`- Path: ${result.outputPath ?? "in-memory"}`);
        console.log(`- Checksum: ${result.metadata.checksum}`);
        console.log(`- Size: ${result.backupBuffer.length} bytes`);
      } else if (command === "restore") {
        if (!inPath) {
          throw new Error("Restore command requires --in=<path>");
        }
        const result = await restoreEncryptedBackup({
          inputPath: inPath,
          databaseUrl: dbUrl,
          encryptionKey: key,
          dryRun: isDryRun
        });
        console.log(`Backup successfully restored!`);
        console.log(`- Checksum: ${result.checksum}`);
        console.log(`- Restored Size: ${result.restoredSize} bytes`);
      } else if (command === "verify") {
        if (!inPath) {
          throw new Error("Verify command requires --in=<path>");
        }
        const result = await verifyEncryptedBackup({
          inputPath: inPath,
          encryptionKey: key
        });
        console.log(`Backup verification passed!`);
        console.log(`- Algorithm: ${result.metadata.algorithm}`);
        console.log(`- Created: ${result.metadata.createdAt}`);
        console.log(`- Checksum: ${result.metadata.checksum}`);
      } else {
        console.log("SignalStack SMS Encrypted Backup & Restore Harness CLI");
        console.log("Usage:");
        console.log("  tsx scripts/backup-restore.ts backup [--out=<path>] [--key=<key>] [--dry-run]");
        console.log("  tsx scripts/backup-restore.ts restore --in=<path> [--key=<key>] [--dry-run]");
        console.log("  tsx scripts/backup-restore.ts verify --in=<path> [--key=<key>]");
      }
    } catch (error) {
      console.error("Backup/Restore operation failed:");
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  })();
}
