/*
# Seed admin pertama

Membuat admin pertama memakai variabel lingkungan (email & password).
Password tidak ditaruh di kode; diambil dari env saat runtime via edge function
atau dijalankan manual satu kali. Di sini kita hanya menyiapkan placeholder:
admin dibuat lewat endpoint admin-actions (function) saat deploy pertama,
atau lewat skrip seed terpisah.

Untuk keperluan demo, buat admin dengan kredensial dari env:
- ADMIN_EMAIL (default admin@patroli.id)
- ADMIN_PASSWORD (minimal 8 karakter)

Catatan: auth.users tidak boleh diisi langsung lewat migrasi (password hash
butuh Supabase Auth internals). Admin dibuat lewat edge function admin-seed
yang memakai service role key.
*/
SELECT 1;
