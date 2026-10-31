// Astro extends Locals by declaration merging, which needs an interface
declare namespace App {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Locals {
    /** The family of the personal link, if the cookie holds a valid one (src/middleware.ts) */
    guardian?: import('./lib/season.ts').Guardian;
  }
}
