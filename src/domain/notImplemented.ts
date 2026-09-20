export class NotImplementedError extends Error {
  constructor(where: string) {
    super(`${where} is not implemented yet.`);
  }
}
