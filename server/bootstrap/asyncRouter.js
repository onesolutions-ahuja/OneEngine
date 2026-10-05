export function installAsyncSafeExpressRouter(express) {
  const originalExpressRouter = express.Router;
  express.Router = function onePosAsyncSafeRouter(...args) {
    const router = originalExpressRouter(...args);
    for (const method of ["get", "post", "put", "patch", "delete", "use"]) {
      const register = router[method].bind(router);
      router[method] = (...registrationArgs) => {
        const wrap = (handler) => {
          if (Array.isArray(handler)) return handler.map(wrap);
          if (typeof handler !== "function" || handler.length === 4 || handler.constructor?.name !== "AsyncFunction") return handler;
          return function onePosAsyncRouteHandler(req, res, next) {
            return Promise.resolve(handler(req, res, next)).catch(next);
          };
        };
        if (!registrationArgs.length) return register();
        const [first, ...rest] = registrationArgs;
        if (typeof first === "function" || Array.isArray(first)) {
          return register(wrap(first), ...rest.map(wrap));
        }
        return register(first, ...rest.map(wrap));
      };
    }
    return router;
  };
  Object.assign(express.Router, originalExpressRouter);
}
