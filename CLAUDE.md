@AGENTS.md

## Cara kerja

- **Leader merencanakan dan me-review.** Leader (sesi utama) memegang arsitektur, keputusan desain, perubahan pada batas durability/keamanan (sync, outbox, pending media, R2, RPC, migration), review akhir setiap diff, dan laporan ke owner.
- **Worker mengerjakan tugas spesifik.** Sub-agent di `.claude/agents/`:
  - `repo-scout` (haiku): pencarian fakta read-only.
  - `reliability-reviewer` (opus): audit/review durability, integritas data, keamanan. Dipakai selektif, hanya untuk perubahan yang menyentuh batas tersebut.
  - `ux-qa` (haiku): menjalankan checklist QA browser, melapor tanpa mengubah kode.
  - `test-writer` (haiku): menulis test di `tests/` dari daftar kasus.
  - `scoped-implementer` (haiku): perubahan kecil yang sudah terspesifikasi penuh.
- **Tugas independen dijalankan paralel.** Kirim sub-agent yang tidak saling bergantung dalam satu giliran.
- **Instruksi ke sub-agent harus spesifik:** file mana yang dibaca/diubah, apa persisnya yang diubah atau dicari, batasan (file yang tidak boleh disentuh), dan kriteria selesai (test/command yang harus lulus, format laporan).
- **Batas keras:** jangan push ke `master`, merge, deploy, atau apply migration ke production database. Jangan upload ke R2/Cloudinary sungguhan tanpa izin owner. Jangan meminta, membaca, atau menyimpan credential; kalau butuh login Studio, berhenti dan minta owner login sendiri.
