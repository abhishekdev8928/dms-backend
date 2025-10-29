import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().min(1, "Department name is required"),
  code: z.string().min(1, "Department code is required"),
  description: z.string().optional(),
  head: z.string().optional(), // userId of head
  isActive: z.boolean().optional(),
});
