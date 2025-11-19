import {z} from "zod"


export const bulkRestoreSchema = z.object({
  body: z.object({
    itemIds: z.array(z.string().length(24)) // MongoDB ObjectId length
  })
});