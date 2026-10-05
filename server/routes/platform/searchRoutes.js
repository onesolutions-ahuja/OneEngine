export function registerPlatformSearchRoutes({ router, authenticate, db, searchPlatformRecords }) {
  router.get("/platform/search", authenticate, async (req, res, next) => {
    try {
      const data = await searchPlatformRecords(db, req, req.query.q);
      res.json({ success: true, data });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error("Platform search error:", error);
      next(error);
    }
  });


}
