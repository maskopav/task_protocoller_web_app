// src/backup/MemoryBackupTarget.js — BackupTarget for tests.
import { assertBackupName } from "./BackupTarget.js";

export class MemoryBackupTarget {
  constructor() {
    this.objects = new Map(); // name -> {data: Buffer, modifiedAt: Date}
  }

  async put(name, data) {
    assertBackupName(name);
    const chunks = [];
    for await (const chunk of data) chunks.push(Buffer.from(chunk));
    // Stored only after the stream ended cleanly: an error above throws first.
    const buf = Buffer.concat(chunks);
    this.objects.set(name, { data: buf, modifiedAt: new Date() });
    return { bytes: buf.length };
  }

  async list(prefix = "") {
    return [...this.objects.entries()]
      .filter(([n]) => n.startsWith(prefix))
      .map(([name, o]) => ({ name, bytes: o.data.length, modifiedAt: o.modifiedAt }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async remove(name) {
    assertBackupName(name);
    this.objects.delete(name);
  }

  describe() {
    return "memory";
  }
}
