import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { authenticate } from "../../middleware/authenticate.js";
import { resolvePrice } from "../../lib/pricing.js";

const router = Router();

router.get("/brochure/parse/:uploadId", authenticate, async (req, res) => {
  // Stub: brochure parsing would read an uploaded Excel file and match product codes
  res.json({
    success: true,
    data: {
      matchedItems: [],
      unmatchedCodes: [],
      totalRows: 0,
      matchedCount: 0,
    },
  });
});

export default router;
