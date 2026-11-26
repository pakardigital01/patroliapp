import { z } from 'zod';

export const npkSchema = z
  .string()
  .min(3, 'NPK minimal 3 karakter')
  .max(20, 'NPK maksimal 20 karakter')
  .regex(/^[A-Za-z0-9]+$/, 'NPK hanya huruf dan angka');

export const emailSchema = z.string().email('Email tidak valid');

export const passwordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter');

export const registerSchema = z.object({
  fullName: z.string().min(3, 'Nama minimal 3 karakter').max(100),
  npk: npkSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Masukkan NPK atau email'),
  password: z.string().min(1, 'Password wajib diisi'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const branchSchema = z.object({
  name: z.string().min(2, 'Nama cabang minimal 2 karakter').max(100),
  code: z.string().min(2, 'Kode cabang minimal 2 karakter').max(20).regex(/^[A-Za-z0-9\-]+$/, 'Kode hanya huruf, angka, tanda hubung'),
  address: z.string().max(300).optional().default(''),
  report_emails: z.string().max(500).optional().default(''),
  active: z.boolean().default(true),
});

export const checkpointSchema = z.object({
  name: z.string().min(2, 'Nama titik minimal 2 karakter').max(100),
  seq: z.number().int().min(0).max(999),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  radius_m: z.number().int().min(1).max(10),
  qr_mode: z.enum(['dinamis', 'statis']),
  active: z.boolean().default(true),
});

export const entrySchema = z.object({
  condition: z.enum(['aman', 'perhatian', 'temuan']),
  notes: z.string().min(10, 'Keterangan minimal 10 karakter').max(2000),
});

export function parseEmailList(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}
