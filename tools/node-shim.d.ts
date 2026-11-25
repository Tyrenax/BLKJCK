/** Le projet n'a pas @types/node : juste ce dont le simulateur a besoin pour écrire sur disque. */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
}
