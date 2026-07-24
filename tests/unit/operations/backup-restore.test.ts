import { describe, expect, it } from "vitest";
import {
  BACKUP_MAGIC_HEADER,
  createEncryptedBackup,
  decryptPayload,
  deriveEncryptionKey,
  encryptPayload,
  parseBackupHeader,
  restoreEncryptedBackup,
  verifyEncryptedBackup
} from "@/scripts/backup-restore";

describe("Encrypted Backup & Restore Harness", () => {
  const samplePayload = Buffer.from(
    "-- SignalStack SMS Test Backup Dump\nCREATE TABLE test_table (id INT PRIMARY KEY, name TEXT);\nINSERT INTO test_table VALUES (1, 'Alice'), (2, 'Bob');\n",
    "utf8"
  );
  const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 64 hex chars
  const wrongKey = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  describe("Key derivation", () => {
    it("derives a 32-byte Buffer from a 64-character hex string", () => {
      const key = deriveEncryptionKey(testKey);
      expect(key.length).toBe(32);
      expect(key.toString("hex")).toBe(testKey);
    });

    it("derives a 32-byte Buffer from a passphrase using scrypt", () => {
      const key = deriveEncryptionKey("my-secret-passphrase");
      expect(key.length).toBe(32);
    });
  });

  describe("Header format and serialization", () => {
    it("produces valid backup buffer starting with magic header bytes", () => {
      const { backupBuffer, metadata } = encryptPayload(samplePayload, testKey);
      expect(backupBuffer.subarray(0, BACKUP_MAGIC_HEADER.length).toString("utf8")).toBe(BACKUP_MAGIC_HEADER);

      const parsed = parseBackupHeader(backupBuffer);
      expect(parsed.metadata.version).toBe(1);
      expect(parsed.metadata.algorithm).toBe("aes-256-gcm");
      expect(parsed.metadata.checksum).toBe(metadata.checksum);
      expect(parsed.metadata.payloadSize).toBe(samplePayload.length);
    });

    it("rejects backup buffer with invalid magic header", () => {
      const invalidBuffer = Buffer.from("INVALID_HEADER!\n1234567890", "utf8");
      expect(() => parseBackupHeader(invalidBuffer)).toThrow("magic bytes mismatch");
    });

    it("rejects backup buffer that is too short", () => {
      const shortBuffer = Buffer.from("SHORT", "utf8");
      expect(() => parseBackupHeader(shortBuffer)).toThrow("file buffer too short");
    });
  });

  describe("Encryption & Decryption roundtrip", () => {
    it("encrypts and decrypts payload back to exact original content", () => {
      const { backupBuffer } = encryptPayload(samplePayload, testKey);
      const { plaintext, metadata } = decryptPayload(backupBuffer, testKey);

      expect(plaintext.toString("utf8")).toBe(samplePayload.toString("utf8"));
      expect(metadata.payloadSize).toBe(samplePayload.length);
    });

    it("fails decryption when an incorrect key is provided", () => {
      const { backupBuffer } = encryptPayload(samplePayload, testKey);
      expect(() => decryptPayload(backupBuffer, wrongKey)).toThrow("Decryption failed: invalid key or tampered ciphertext.");
    });
  });

  describe("Checksum and payload tampering validation", () => {
    it("fails decryption/verification when ciphertext payload is tampered", () => {
      const { backupBuffer } = encryptPayload(samplePayload, testKey);
      const tamperedBuffer = Buffer.from(backupBuffer);

      // Flip a bit in the ciphertext payload area
      tamperedBuffer[tamperedBuffer.length - 1] ^= 0xff;

      expect(() => decryptPayload(tamperedBuffer, testKey)).toThrow("Decryption failed: invalid key or tampered ciphertext.");
    });

    it("fails checksum validation when header checksum metadata is tampered but ciphertext decrypts", () => {
      const { backupBuffer, metadata } = encryptPayload(samplePayload, testKey);

      // Create tampered metadata with incorrect checksum
      const tamperedMetadata = { ...metadata, checksum: "0000000000000000000000000000000000000000000000000000000000000000" };
      const jsonBuf = Buffer.from(JSON.stringify(tamperedMetadata), "utf8");
      const headerLenBuf = Buffer.alloc(4);
      headerLenBuf.writeUInt32BE(jsonBuf.length, 0);

      const magicBuf = Buffer.from(BACKUP_MAGIC_HEADER, "utf8");
      const ciphertext = backupBuffer.subarray(parseBackupHeader(backupBuffer).totalHeaderOffset);

      const tamperedBackupBuffer = Buffer.concat([magicBuf, headerLenBuf, jsonBuf, ciphertext]);

      expect(() => decryptPayload(tamperedBackupBuffer, testKey)).toThrow("Checksum validation failed: payload corruption detected.");
    });
  });

  describe("Restore drill idempotency and programatic API", () => {
    it("performs backup, verification, and restore drill programmatically", async () => {
      const backupResult = await createEncryptedBackup({
        inputPayload: samplePayload,
        encryptionKey: testKey
      });

      expect(backupResult.metadata.checksum).toBeDefined();

      const verifyResult = await verifyEncryptedBackup({
        inputBuffer: backupResult.backupBuffer,
        encryptionKey: testKey
      });

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.checksumMatches).toBe(true);

      const executedSqls: string[] = [];

      // Drill Restore 1
      const restoreResult1 = await restoreEncryptedBackup({
        inputBuffer: backupResult.backupBuffer,
        encryptionKey: testKey,
        dryRun: true,
        onRestoreSql: (sql) => executedSqls.push(sql)
      });

      expect(restoreResult1.success).toBe(true);
      expect(restoreResult1.restoredContent).toBe(samplePayload.toString("utf8"));

      // Drill Restore 2 (Idempotency check)
      const restoreResult2 = await restoreEncryptedBackup({
        inputBuffer: backupResult.backupBuffer,
        encryptionKey: testKey,
        dryRun: true,
        onRestoreSql: (sql) => executedSqls.push(sql)
      });

      expect(restoreResult2.success).toBe(true);
      expect(restoreResult2.checksum).toBe(restoreResult1.checksum);
      expect(executedSqls[0]).toBe(executedSqls[1]);
    });
  });
});
