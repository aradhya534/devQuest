// supertest-session ships no type declarations and none exist on
// DefinitelyTyped, so this hand-written ambient module fills the gap. Its
// session object behaves like a supertest Agent (cookie-jar-carrying,
// chainable http methods), which is exactly what @types/supertest already
// types as `Agent` — reused here rather than typed as `any`.
declare module "supertest-session" {
  import type { Agent } from "supertest";
  import type { Application } from "express";
  import type { Server } from "http";

  interface SessionOptions {
    cookie?: string;
  }

  function session(app: Application | Server, options?: SessionOptions): Agent;

  export default session;
}
