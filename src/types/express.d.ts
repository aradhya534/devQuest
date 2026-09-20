// Fields the app's own middleware attaches to the request, on top of what
// @types/express already declares. Declared here via module augmentation
// rather than casting `req` to `any` at each call site.
import type { Principal } from "../domain/session.js";

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
      principal?: Principal;
    }
  }
}

export {};
